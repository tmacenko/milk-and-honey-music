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
    // Cache-busted: a login created a moment ago must work right away, and
    // read-modify-write below must never start from a stale copy.
    const r = await fetch(`${BLOB_PUBLIC}/${AUTH_USERS_PATH}?v=${Date.now()}`, { cache: 'no-store' });
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
function hashScrypt(pw) {
  const N = 16384, r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 32, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
// Same style as the original handout: word-word-123.
const PW_WORDS = ['amber', 'arrow', 'aspen', 'bloom', 'brook', 'cedar', 'cider', 'cliff', 'clover', 'coral', 'crest', 'delta', 'denim', 'ember', 'fable', 'fern', 'field', 'flint', 'frost', 'glade', 'grove', 'harbor', 'hazel', 'heron', 'indigo', 'inlet', 'ivory', 'jade', 'juniper', 'kayak', 'kestrel', 'lagoon', 'ledge', 'linen', 'lotus', 'lunar', 'maple', 'meadow', 'mesa', 'north', 'oak', 'orbit', 'pebble', 'pine', 'plume', 'prism', 'quill', 'raven', 'reef', 'ridge', 'river', 'sable', 'sage', 'slate', 'solar', 'spruce', 'stone', 'summit', 'tempo', 'thistle', 'timber', 'topaz', 'tulip', 'vale', 'violet', 'walnut', 'willow', 'yarrow', 'zephyr'];
function makePassword() {
  const w = () => PW_WORDS[crypto.randomInt(PW_WORDS.length)];
  let a = w(), b = w();
  while (b === a) b = w();
  return `${a}-${b}-${crypto.randomInt(100, 1000)}`;
}
function verifyScrypt(pw, stored) {
  try {
    const [tag, N, r, p, salt, hash] = String(stored || '').split('$');
    if (tag !== 'scrypt') return false;
    const want = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p, maxmem: 128 * 1024 * 1024 });
    return want.length > 0 && crypto.timingSafeEqual(want, got);
  } catch { return false; }
}

// ── Individual logins ───────────────────────────────────────────────────────
// Who someone is (name, role, email, status, division) comes from the Staff
// tab in the sports sheet; their password lives only as a hash in the
// encrypted store above. Each password is unique — typing it at the landing
// gate logs that person in. Logins are managed on the owner's Usage page.
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
    const nameC = col('name'), passC = col('password'), roleC = col('role'), emailC = col('email'), statusC = col('status'), divC = col('division');
    if (nameC < 0) return null;
    return rows.slice(1).map(row => ({
      name: String(row[nameC] || '').trim(),
      role: String(roleC >= 0 ? row[roleC] || '' : '').trim().toLowerCase() || 'agent',
      email: String(emailC >= 0 ? row[emailC] || '' : '').trim(),
      plainPw: String(passC >= 0 ? row[passC] || '' : '').trim(),
      status: String(statusC >= 0 ? row[statusC] || '' : '').trim().toLowerCase(),
      division: String(divC >= 0 ? row[divC] || '' : '').trim(),
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
    // Staff tab Division (Music / Sports / Both) — picks the landing side.
    division: (d && d.division) || '',
  });
  // Hashed store first. Once it exists it is authoritative — plaintext sheet
  // passwords stop working the moment the migration uploads it.
  const store = await loadAuthUsers(secret);
  if (store && store.users) {
    for (const [key, u] of Object.entries(store.users)) {
      if (u.hash && verifyScrypt(pw, u.hash)) {
        const d = byKey.get(key);
        // Marked Former in the Staff tab → no login (their records stay).
        if (d && d.status === 'former') return null;
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

    // ADMIN_PASSWORD (the shared house login) is optional and being retired —
    // staff log in with individual passwords; the b2b gate stays separate.
    if (!secret) return res.status(500).json({ error: 'Auth is not configured on the server.' });

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

    // ── Staff logins (owner only) ───────────────────────────────────────────
    // List who has a login, create/reset logins (the server makes the
    // password and returns it ONCE — only its hash is stored), revoke, and
    // relink a login saved under an old name spelling. Existing passwords are
    // never touched except by an explicit reset/revoke of that person.
    if (/^logins-(list|create|revoke|relink)$/.test(action || '')) {
      const st = authState(req);
      const owners = String(process.env.USAGE_OWNERS || 'tyler@milkhoneyla.com').toLowerCase().split(',').map(x => x.trim());
      if (!st.user || !owners.includes(String(st.user.email || '').toLowerCase())) return res.status(403).json({ error: 'Not authorized' });
      const dir = (await staffDirectory()) || [];
      const byKey = new Map(dir.map(u => [u.name.toLowerCase(), u]));
      const store = (await loadAuthUsers(secret)) || { users: {} };
      store.users = store.users || {};
      const body = req.body || {};
      if (action === 'logins-list') {
        return res.json({
          people: dir.map(u => ({ name: u.name, role: u.role, division: u.division, status: u.status || 'active', hasLogin: !!(store.users[u.name.toLowerCase()] || {}).hash, email: !!u.email })),
          orphans: Object.keys(store.users).filter(k => !byKey.has(k)).map(k => store.users[k].name || k),
        });
      }
      const save = async () => { store.updatedAt = new Date().toISOString(); await saveAuthUsers(store, secret); };
      if (action === 'logins-create') {
        const names = (Array.isArray(body.names) ? body.names : []).slice(0, 60);
        const out = [];
        const taken = new Set();
        for (const n of names) {
          const d = byKey.get(String(n || '').trim().toLowerCase());
          if (!d || d.status === 'former') continue;
          let pw = '';
          // Unique across everyone: login matches on the password alone.
          for (let i = 0; i < 20 && !pw; i++) {
            const cand = makePassword();
            if (taken.has(cand) || Object.values(store.users).some(u => u.hash && verifyScrypt(cand, u.hash))) continue;
            pw = cand;
          }
          if (!pw) continue;
          taken.add(pw);
          store.users[d.name.toLowerCase()] = { name: d.name, hash: hashScrypt(pw), setAt: new Date().toISOString() };
          out.push({ name: d.name, password: pw });
        }
        if (out.length) await save();
        return res.json({ ok: true, created: out });
      }
      if (action === 'logins-revoke') {
        const k = String(body.name || '').trim().toLowerCase();
        if (!store.users[k]) return res.json({ ok: true, removed: 0 });
        delete store.users[k];
        await save();
        return res.json({ ok: true, removed: 1 });
      }
      if (action === 'logins-relink') {
        const from = String(body.from || '').trim().toLowerCase(), to = byKey.get(String(body.to || '').trim().toLowerCase());
        if (!store.users[from] || !to) return res.status(400).json({ error: 'Nothing to relink' });
        if (store.users[to.name.toLowerCase()]) return res.status(400).json({ error: `${to.name} already has a login` });
        store.users[to.name.toLowerCase()] = { ...store.users[from], name: to.name };
        delete store.users[from];
        await save();
        return res.json({ ok: true });
      }
    }

    // House password only while the env var still exists, then individual
    // staff passwords.
    let payload = null;
    let user = null;
    if (password && safeEqual(pw, password)) {
      payload = { role: 'admin' };
    } else {
      user = await findUser(String(pw || '').trim(), secret);
      if (user && user.name) payload = { role: 'admin', name: user.name, userRole: user.userRole, agentKey: user.agentKey, email: user.email };
    }
    if (!payload) return res.status(401).json({ error: 'Incorrect password.' });

    payload.exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS;
    const token = sign(payload, secret);
    res.setHeader('Set-Cookie', cookie(token, THIRTY_DAYS));
    return res.json({ ok: true, isAdmin: true, user: user ? { name: user.name, agentKey: user.agentKey, userRole: user.userRole, email: user.email, division: user.division } : null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
