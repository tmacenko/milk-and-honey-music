// Small encrypted-JSON store on Vercel Blob. The blob store serves public
// deterministic URLs, so everything written here is AES-256-GCM encrypted
// with a key derived from AUTH_SECRET + the file's own path (one leaked file
// can't decrypt another). Used for the staff password hashes and the shared
// tool credentials — never store plaintext secrets anywhere else.
const crypto = require('crypto');

const BLOB_API = 'https://blob.vercel-storage.com';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_PUBLIC = (() => {
  const m = String(BLOB_TOKEN || '').match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? `https://${m[1]}.public.blob.vercel-storage.com` : null;
})();

const encKey = (secret, path) => crypto.createHash('sha256').update(path + ':' + secret).digest();

function encryptJson(obj, secret, path) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(secret, path), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}

function decryptJson(str, secret, path) {
  const { iv, tag, data } = JSON.parse(str);
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(secret, path), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}

async function loadEnc(path, secret) {
  if (!BLOB_TOKEN || !BLOB_PUBLIC) return null;
  try {
    const r = await fetch(`${BLOB_PUBLIC}/${path}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return decryptJson(await r.text(), secret, path);
  } catch { return null; }
}

async function saveEnc(path, obj, secret) {
  const r = await fetch(`${BLOB_API}/${path}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7', 'content-type': 'application/json', 'x-add-random-suffix': '0' },
    body: encryptJson(obj, secret, path),
  });
  if (!r.ok) throw new Error('Blob save failed: ' + r.status);
}

module.exports = { loadEnc, saveEnc };
