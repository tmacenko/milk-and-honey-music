const crypto = require('crypto');
const { COOKIE, sign, verify, parseCookies, authState } = require('../lib/auth');

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const cookie = (val, maxAge) =>
  `${COOKIE}=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
};

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
async function findUser(pw) {
  const sheetId = process.env.SPORTS_SHEET_ID;
  if (!sheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return null;
  try {
    const token = await getSheetsToken();
    // Logins live in the Users tab. (A legacy "Staff" tab from the old sports
    // app also exists in this sheet — check Users FIRST so it always wins.)
    let data = null;
    for (const tab of ['Users', 'Staff']) {
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`'${tab}'!A:F`)}`, {
        headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!d.error && (d.values || []).length) { data = d; break; }
    }
    if (!data) return null; // tab missing / unreadable -> only master login works
    const rows = data.values || [];
    if (rows.length < 2) return null;
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
    const col = (name) => headers.findIndex(h => h === name);
    const nameC = col('name'), passC = col('password'), roleC = col('role'), keyC = col('agent key');
    if (nameC < 0 || passC < 0) return null;
    for (const row of rows.slice(1)) {
      const rowPw = String(row[passC] || '').trim();
      if (rowPw && safeEqual(pw, rowPw)) {
        return {
          name: String(row[nameC] || '').trim(),
          userRole: String(roleC >= 0 ? row[roleC] || '' : '').trim().toLowerCase() || 'agent',
          agentKey: String(keyC >= 0 ? row[keyC] || '' : '').trim(),
        };
      }
    }
    return null;
  } catch (e) {
    console.error('Users lookup error:', e.message);
    return null;
  }
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

    // Master (house) password first, then individual passwords from the Users tab.
    let payload = null;
    let user = null;
    if (safeEqual(pw, password)) {
      payload = { role: 'admin' };
    } else {
      user = await findUser(String(pw || '').trim());
      if (user && user.name) payload = { role: 'admin', name: user.name, userRole: user.userRole, agentKey: user.agentKey };
    }
    if (!payload) return res.status(401).json({ error: 'Incorrect password.' });

    payload.exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS;
    const token = sign(payload, secret);
    res.setHeader('Set-Cookie', cookie(token, THIRTY_DAYS));
    return res.json({ ok: true, isAdmin: true, user: user ? { name: user.name, agentKey: user.agentKey, userRole: user.userRole } : null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
