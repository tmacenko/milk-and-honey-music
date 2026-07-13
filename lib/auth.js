// Lightweight shared-passphrase auth for the internal dashboard.
// A single admin passphrase (ADMIN_PASSWORD) is verified server-side; on success
// we issue an HMAC-signed cookie (signed with AUTH_SECRET) that gates the full
// dataset and all writes. No user accounts / database.
//
// Fail-safe rollout: if AUTH_SECRET is not configured, the API runs in "legacy
// open mode" (everything visible/editable, as before), so deploying this code
// changes nothing until the env vars are set in Vercel.
const crypto = require('crypto');

const COOKIE = 'mh_session';

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

function sign(payload, secret) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${head}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(pair => {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

// { configured } is false when AUTH_SECRET isn't set (legacy open mode).
function authState(req) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return { configured: false, admin: false };
  const payload = verify(parseCookies(req)[COOKIE], secret);
  return { configured: true, admin: !!(payload && payload.role === 'admin') };
}

module.exports = { COOKIE, sign, verify, parseCookies, authState };
