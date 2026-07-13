const crypto = require('crypto');
const { COOKIE, sign, verify, parseCookies } = require('../lib/auth');

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const cookie = (val, maxAge) =>
  `${COOKIE}=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

module.exports = async (req, res) => {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.ADMIN_PASSWORD;

  // Report current auth status (used by the app on load).
  if (req.method === 'GET') {
    if (!secret) return res.json({ authConfigured: false, isAdmin: true });
    const payload = verify(parseCookies(req)[COOKIE], secret);
    return res.json({ authConfigured: true, isAdmin: !!(payload && payload.role === 'admin') });
  }

  if (req.method === 'POST') {
    const { action, password: pw } = req.body || {};

    if (action === 'logout') {
      res.setHeader('Set-Cookie', cookie('', 0));
      return res.json({ ok: true, isAdmin: false });
    }

    if (!secret || !password) return res.status(500).json({ error: 'Auth is not configured on the server.' });
    const a = Buffer.from(String(pw || ''));
    const b = Buffer.from(String(password));
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) return res.status(401).json({ error: 'Incorrect password.' });

    const token = sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS }, secret);
    res.setHeader('Set-Cookie', cookie(token, THIRTY_DAYS));
    return res.json({ ok: true, isAdmin: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
