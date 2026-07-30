// api/backup.js — weekly snapshot of BOTH Google Sheets into Vercel Blob.
//
// The sheets are the app's only database and staff edit them daily; git holds
// the code but nothing holds the data. This cron dumps every tab (including
// hidden robot tabs) of the Music and Sports spreadsheets to date-stamped JSON
// blobs, then prunes old snapshots so storage never creeps.
//
// Blob URLs get a random suffix (same capability-URL model as share links), so
// snapshots aren't guessable even though the store is public; the listing that
// reveals them is admin-only.
//
// GET  /api/backup                → run a snapshot (Vercel cron, ?key=CRON_SECRET,
//                                   or an admin session)
// GET  /api/backup?list=1         → admin-only: list stored snapshots w/ URLs
//
// Restore path: download the JSON, and either hand-paste the affected tab back
// into the sheet or ask for a small one-off script to write it via the API.
const crypto = require('crypto');
const { authState } = require('../lib/auth');

const BLOB_API = 'https://blob.vercel-storage.com';
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const SHEETS = {
  music: process.env.MUSIC_SHEET_ID,
  sports: process.env.SPORTS_SHEET_ID,
};
const KEEP_PER_DOMAIN = 10; // ~2.5 months of weekly snapshots

function b64url(str) { return Buffer.from(str).toString('base64url'); }
async function getToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${sig}` }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Sheets auth failed');
  return data.access_token;
}

async function snapshotSheet(token, sheetId) {
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title,hidden))`, {
    headers: { Authorization: `Bearer ${token}` } })).json();
  if (meta.error) throw new Error(`Sheets meta: ${meta.error.message}`);
  const titles = (meta.sheets || []).map(s => s.properties.title);
  const tabs = {};
  for (const title of titles) {
    const d = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`'${title}'!A1:BZ`)}`, {
      headers: { Authorization: `Bearer ${token}` } })).json();
    if (d.error) throw new Error(`Read "${title}": ${d.error.message}`);
    tabs[title] = d.values || [];
  }
  return { takenAt: new Date().toISOString(), sheetId, tabCount: titles.length, tabs };
}

async function blobList(prefix) {
  const r = await fetch(`${BLOB_API}?${new URLSearchParams({ prefix, limit: '200' })}`, {
    headers: { authorization: `Bearer ${TOKEN}`, 'x-api-version': '7' } });
  const d = await r.json();
  return d.blobs || [];
}

module.exports = async (req, res) => {
  const key = String((req.query || {}).key || '');
  const okCron = !!process.env.CRON_SECRET &&
    (key === process.env.CRON_SECRET || req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`);
  const { configured, admin } = authState(req);
  if (!okCron && configured && !admin) return res.status(401).json({ error: 'Not authorized' });
  if (!TOKEN) return res.status(500).json({ error: 'Blob storage not configured' });

  try {
    // Admin-only inventory of stored snapshots (URLs included — treat as secret).
    if (req.query.list) {
      const blobs = await blobList('backups/');
      return res.json({
        backups: blobs
          .sort((a, b) => String(b.pathname).localeCompare(String(a.pathname)))
          .map(b => ({ name: b.pathname, sizeKB: Math.round((b.size || 0) / 1024), uploadedAt: b.uploadedAt, url: b.url })),
      });
    }

    const token = await getToken();
    const date = new Date().toISOString().slice(0, 10);
    const saved = [];
    for (const [domain, sheetId] of Object.entries(SHEETS)) {
      if (!sheetId) continue;
      const snap = await snapshotSheet(token, sheetId);
      const up = await fetch(`${BLOB_API}/backups/${date}-${domain}.json`, {
        method: 'PUT',
        body: JSON.stringify(snap),
        // Random suffix => unguessable URL (the public store's capability model).
        headers: { authorization: `Bearer ${TOKEN}`, 'x-api-version': '7', 'content-type': 'application/json', 'x-add-random-suffix': '1' },
      });
      const ud = await up.json();
      if (!ud.url) throw new Error(`Blob upload failed for ${domain}: ${JSON.stringify(ud).slice(0, 200)}`);
      saved.push({ domain, tabs: snap.tabCount, name: ud.pathname });
    }

    // Prune: keep the newest KEEP_PER_DOMAIN snapshots per domain.
    const blobs = await blobList('backups/');
    const byDomain = {};
    for (const b of blobs.sort((a, z) => String(z.pathname).localeCompare(String(a.pathname)))) {
      const dom = /-(music|sports)/.exec(b.pathname)?.[1] || 'other';
      (byDomain[dom] = byDomain[dom] || []).push(b);
    }
    const stale = Object.values(byDomain).flatMap(list => list.slice(KEEP_PER_DOMAIN)).map(b => b.url);
    if (stale.length) {
      await fetch(`${BLOB_API}/delete`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'x-api-version': '7', 'content-type': 'application/json' },
        body: JSON.stringify({ urls: stale }),
      });
    }

    return res.json({ success: true, saved, pruned: stale.length });
  } catch (err) {
    console.error('Backup error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
