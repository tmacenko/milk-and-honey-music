// api/prospects.js — Prospect Search data (sports side).
//
// GET                 → { url, ts, season, careerSeasons } for the current
//                       gzipped search file (staff sessions only). The browser
//                       downloads it straight from Blob and unzips it itself.
// GET ?build=1        → rebuild from CollegeFootballData (admin session, or
//                       the weekly cron via `Authorization: Bearer CRON_SECRET`).
//
// The file is public football data (rosters, recruiting, stats) — nothing
// internal. "Is this our client / on our board" is computed in the browser
// from data only staff sessions receive.
const zlib = require('zlib');
const { authState } = require('../lib/auth');
const { buildProspects } = require('../lib/prospects');

const BLOB_API = 'https://blob.vercel-storage.com';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_PUBLIC = (() => {
  const m = String(BLOB_TOKEN || '').match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? `https://${m[1]}.public.blob.vercel-storage.com` : null;
})();
const DATA_PATH = 'prospects-v1.json.gz';
const META_PATH = 'prospects-meta.json';

async function blobPut(path, body, contentType) {
  const r = await fetch(`${BLOB_API}/${path}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7', 'content-type': contentType, 'x-add-random-suffix': '0', 'x-cache-control-max-age': '60' },
    body,
  });
  if (!r.ok) throw new Error(`Blob write ${path} → HTTP ${r.status}`);
}
async function blobGetJson(path) {
  if (!BLOB_PUBLIC) return null;
  try {
    const r = await fetch(`${BLOB_PUBLIC}/${path}?t=${Date.now()}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const cronOk = !!secret && bearer === secret;
  const { configured, admin, user } = authState(req);
  if (!cronOk && configured && !admin) return res.status(401).json({ error: 'Not authorized' });
  if (!BLOB_TOKEN || !BLOB_PUBLIC) return res.status(500).json({ error: 'Blob storage not configured' });

  if (req.query.build) {
    // Rebuilds: cron, or an admin-role person (not every staff login).
    if (!cronOk && user && user.userRole !== 'admin') return res.status(403).json({ error: 'Admins only' });
    const key = process.env.CFBD_API_KEY;
    if (!key) return res.status(500).json({ error: 'CFBD_API_KEY not set' });
    try {
      const store = {
        get: (name) => blobGetJson(name),
        put: (name, obj) => blobPut(name, JSON.stringify(obj), 'application/json'),
      };
      const { data, log } = await buildProspects({ key, store });
      await blobPut(DATA_PATH, zlib.gzipSync(JSON.stringify(data)), 'application/octet-stream');
      const meta = { ts: data.ts, season: data.season, players: data.players.length, careerSeasons: data.careerSeasons, careerMissing: data.careerMissing };
      await blobPut(META_PATH, JSON.stringify(meta), 'application/json');
      console.log('prospects build:', log.join(' | '));
      return res.json({ ok: true, ...meta, log });
    } catch (e) {
      console.error('prospects build failed:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  const meta = await blobGetJson(META_PATH);
  if (!meta) return res.json({ missing: true });
  return res.json({ ...meta, url: `${BLOB_PUBLIC}/${DATA_PATH}?v=${meta.ts}` });
};
