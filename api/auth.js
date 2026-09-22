const crypto = require('crypto');
const { COOKIE, sign, verify, parseCookies, authState } = require('../lib/auth');

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const cookie = (val, maxAge) =>
  `${COOKIE}=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
};

// ── Hashed staff credentials (Vercel Blob, encrypted at rest) ────────────────
// Passwords themselves are never stored anywhere — only scrypt hashes. The
// hash file lives in Vercel Blob, which serves public deterministic URLs, so
// the file is additionally AES-256-GCM encrypted with a key derived from
// AUTH_SECRET. The Staff sheet tab stays the directory (name/role/email) but
// holds no secrets once the Password column is retired. Written only by the
// 'auth-users-store' action (admin-level session).
const BLOB_API = 'https://blob.vercel-storage.com';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_PUBLIC = (() => {
  const m = String(BLOB_TOKEN || '').match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? `https://${m[1]}.public.blob.vercel-storage.com` : null;
})();
const AUTH_USERS_PATH = 'auth-users.enc.json';
const encKey = (secret) => crypto.createHash('sha256').update('auth-users:' + secret).digest();
function encryptJson(obj, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(secret), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function decryptJson(str, secret) {
  const { iv, tag, data } = JSON.parse(str);
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(secret), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}
async function loadAuthUsers(secret) {
  if (!BLOB_TOKEN || !BLOB_PUBLIC) return null;
  try {
    const r = await fetch(`${BLOB_PUBLIC}/${AUTH_USERS_PATH}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return decryptJson(await r.text(), secret);
  } catch { return null; }
}
async function saveAuthUsers(store, secret) {
  const r = await fetch(`${BLOB_API}/${AUTH_USERS_PATH}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7', 'content-type': 'application/json', 'x-add-random-suffix': '0' },
    body: encryptJson(store, secret),
  });
  if (!r.ok) throw new Error('Blob save failed: ' + r.status);
}
// Hash format: scrypt$N$r$p$salt(b64)$hash(b64)
function verifyScrypt(pw, stored) {
  try {
    const [tag, N, r, p, salt, hash] = String(stored || '').split('$');
    if (tag !== 'scrypt') return false;
    const want = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p, maxmem: 128 * 1024 * 1024 });
    return want.length > 0 && crypto.timingSafeEqual(want, got);
  } catch { return false; }
}

// ── Individual logins: the Users tab in the sports sheet ─────────────────────
// Columns (tolerant of casing): Name | Password | Role | Agent Key.
// Each employee gets a unique personal password; typing it at the landing gate
// logs them in as themselves. Managed entirely by editing the sheet.
function b64url(str) { return Buffer.from(str).toString('base64url'); }
async function getSheetsToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const s = crypto.createSign('RSA-SHA256');
  s.update(`${header}.${payload}`);
  const sig = s.sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${sig}` }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Sheets auth failed');
  return data.access_token;
}
// Staff directory rows (no secrets required): Name | Role | Email, with the
// legacy plaintext Password column read only until the migration completes.
async function staffDirectory() {
  const sheetId = process.env.SPORTS_SHEET_ID;
  if (!sheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return null;
  try {
    const token = await getSheetsToken();
    let data = null;
    for (const tab of ['Users', 'Staff']) {
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`'${tab}'!A:J`)}`, {
        headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!d.error && (d.values || []).length) { data = d; break; }
    }
    if (!data) return null;
    const rows = data.values || [];
    if (rows.length < 2) return null;
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
    const col = (name) => headers.findIndex(h => h === name);
    const nameC = col('name'), passC = col('password'), roleC = col('role'), emailC = col('email');
    if (nameC < 0) return null;
    return rows.slice(1).map(row => ({
      name: String(row[nameC] || '').trim(),
      role: String(roleC >= 0 ? row[roleC] || '' : '').trim().toLowerCase() || 'agent',
      email: String(emailC >= 0 ? row[emailC] || '' : '').trim(),
      plainPw: String(passC >= 0 ? row[passC] || '' : '').trim(),
    })).filter(u => u.name);
  } catch (e) {
    console.error('Staff directory error:', e.message);
    return null;
  }
}

async function findUser(pw, secret) {
  const dir = await staffDirectory();
  const byKey = new Map((dir || []).map(u => [u.name.toLowerCase(), u]));
  const asUser = (name, d) => ({
    name,
    userRole: (d && d.role) || 'agent',
    // "My clients" matching keys off the canonical staff name — agent cells
    // hold the same names, so no separate key is needed.
    agentKey: name,
    // Work email (optional column) — the music Tools sidebar copies it for
    // sites that log in via a code sent to your own address.
    email: (d && d.email) || '',
  });
  // Hashed store first. Once it exists it is authoritative — plaintext sheet
  // passwords stop working the moment the migration uploads it.
  const store = await loadAuthUsers(secret);
  if (store && store.users) {
    for (const [key, u] of Object.entries(store.users)) {
      if (u.hash && verifyScrypt(pw, u.hash)) {
        const d = byKey.get(key);
        return asUser((d && d.name) || u.name || key, d);
      }
    }
    return null;
  }
  // Legacy (pre-migration): plaintext Password column in the sheet.
  for (const u of dir || []) {
    if (u.plainPw && safeEqual(pw, u.plainPw)) return asUser(u.name, u);
  }
  return null;
}

module.exports = async (req, res) => {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.ADMIN_PASSWORD;

  // Report current auth status (used by the app on load).
  if (req.method === 'GET') {
    if (!secret) return res.json({ authConfigured: false, isAdmin: true, user: null });
    const st = authState(req);
    return res.json({ authConfigured: true, isAdmin: st.admin, user: st.user });
  }

  if (req.method === 'POST') {
    const { action, password: pw } = req.body || {};

    if (action === 'logout') {
      res.setHeader('Set-Cookie', cookie('', 0));
      return res.json({ ok: true, isAdmin: false });
    }

    if (!secret || !password) return res.status(500).json({ error: 'Auth is not configured on the server.' });

    // Replace the hashed-credentials store (migration / password resets).
    // House sessions and admin-role users only — a plain agent session must
    // not be able to rewrite everyone's logins.
    if (action === 'auth-users-store') {
      const st = authState(req);
      if (!st.admin || (st.user && st.user.userRole !== 'admin')) return res.status(403).json({ error: 'Not authorized' });
      const users = (req.body || {}).users;
      if (!users || typeof users !== 'object' || Array.isArray(users)) return res.status(400).json({ error: 'Missing users map' });
      await saveAuthUsers({ users, updatedAt: new Date().toISOString() }, secret);
      return res.json({ ok: true, count: Object.keys(users).length });
    }

    // Master (house) password first, then individual staff passwords.
    let payload = null;
    let user = null;
    if (safeEqual(pw, password)) {
      payload = { role: 'admin' };
    } else {
      user = await findUser(String(pw || '').trim(), secret);
      if (user && user.name) payload = { role: 'admin', name: user.name, userRole: user.userRole, agentKey: user.agentKey, email: user.email };
    }
    if (!payload) return res.status(401).json({ error: 'Incorrect password.' });

    payload.exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS;
    const token = sign(payload, secret);
    res.setHeader('Set-Cookie', cookie(token, THIRTY_DAYS));
    return res.json({ ok: true, isAdmin: true, user: user ? { name: user.name, agentKey: user.agentKey, userRole: user.userRole, email: user.email } : null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
