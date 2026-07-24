// api/refresh-music.js — weekly (Friday ~2AM ET) music-side data refresh.
//
// Two jobs in one pass over the Clients tab:
//   1. Monthly listeners: for clients whose Spotify URL is an ARTIST profile
//      (open.spotify.com/artist/{id}), scrape the public artist page for the
//      exact monthlyListeners count and write it into the "Spotify Monthly
//      Listeners" column. Songwriter/producer profiles are skipped — those
//      pages don't show listeners. Never blanks a value on a failed fetch.
//      Each run also appends to a hidden ListenerHistory tab (date|name|
//      listeners) so listener growth can be charted later.
//   2. Recent releases: re-fetches each artist's latest albums/singles from
//      the Spotify API and overwrites the Vercel Blob releases cache, so the
//      dashboard's "Recent releases" tile is fresh every Friday morning
//      (release day) instead of waiting for a lazy 7-day TTL to expire.
//
// Auth: admin cookie, or `Authorization: Bearer $CRON_SECRET` (what Vercel
// Cron sends when CRON_SECRET is set), or `?key=$CRON_SECRET` for manual runs.
const crypto = require('crypto');
const { authState } = require('../lib/auth');

const SHEET_ID = process.env.MUSIC_SHEET_ID;
const BLOB_API = 'https://blob.vercel-storage.com';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const RELEASES_CACHE_PATH = 'spotify-releases-cache.json'; // shared with api/sheets.js
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ── Google Sheets helpers ─────────────────────────────────────────────────────
function b64url(s) { return Buffer.from(s).toString('base64url'); }
async function getToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${sig}` }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Google auth failed');
  return data.access_token;
}
async function sheetGet(token, range) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}
async function sheetBatchWrite(token, data) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
  if (!r.ok) throw new Error('Sheet write failed: ' + (await r.text()).slice(0, 200));
}
async function sheetAppend(token, range, values) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!r.ok) throw new Error('Sheet append failed: ' + (await r.text()).slice(0, 200));
}
// Create the hidden ListenerHistory tab on first run.
async function ensureHistoryTab(token) {
  const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
  if ((meta.sheets || []).some(s => s.properties?.title === 'ListenerHistory')) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'ListenerHistory', hidden: true } } }] }),
  });
  await sheetAppend(token, 'ListenerHistory!A:C', [['date', 'name', 'listeners']]);
}
function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ── Blob cache helpers (same store api/sheets.js reads) ───────────────────────
const BLOB_PUBLIC = (() => {
  const m = String(BLOB_TOKEN || '').match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? `https://${m[1]}.public.blob.vercel-storage.com` : null;
})();
async function loadBlobCache(path) {
  if (!BLOB_TOKEN || !BLOB_PUBLIC) return {};
  try {
    const d = await fetch(`${BLOB_PUBLIC}/${path}`);
    if (d.ok) return await d.json();
  } catch { /* fall through */ }
  return {};
}
async function saveBlobCache(path, cache) {
  if (!BLOB_TOKEN) return;
  await fetch(`${BLOB_API}/${path}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7',
      'content-type': 'application/json', 'x-add-random-suffix': '0',
    },
    body: JSON.stringify(cache),
  });
}

// ── Spotify ───────────────────────────────────────────────────────────────────
// The public artist page embeds the exact count as "monthlyListeners":N; the
// og:description meta ("Artist · 4.5M monthly listeners") is the fallback.
async function fetchMonthlyListeners(artistId) {
  const r = await fetch(`https://open.spotify.com/artist/${artistId}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) return null;
  const html = await r.text();
  const exact = html.match(/"monthlyListeners"\s*:\s*(\d+)/);
  if (exact) return parseInt(exact[1], 10);
  const og = html.match(/content="[^"]*?([\d.,]+\s*[KMB]?)\s*monthly listeners/i);
  if (og) {
    const s = og[1].replace(/,/g, '').trim().toUpperCase();
    const mul = s.endsWith('K') ? 1e3 : s.endsWith('M') ? 1e6 : s.endsWith('B') ? 1e9 : 1;
    const n = parseFloat(s);
    if (isFinite(n)) return Math.round(n * mul);
  }
  return null;
}
async function getSpotifyApiToken() {
  const cid = process.env.SPOTIFY_CLIENT_ID, csec = process.env.SPOTIFY_CLIENT_SECRET;
  if (!cid || !csec) return null;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${cid}:${csec}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  return d.access_token || null;
}
async function fetchReleases(artistId, apiToken) {
  const r = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=10`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (r.status === 429) return { rateLimited: true };
  if (!r.ok) return null;
  const d = await r.json();
  return {
    releases: (d.items || [])
      .filter(a => a?.release_date)
      .sort((x, y) => new Date(y.release_date) - new Date(x.release_date))
      .slice(0, 8)
      .map(a => ({
        name: a.name, type: a.album_type, artwork: a.images?.[0]?.url,
        releaseDate: a.release_date, url: a.external_urls?.spotify,
      })),
  };
}

// Bounded-concurrency runner.
async function runPool(items, limit, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const keyOk = secret && (bearer === secret || req.query?.key === secret);
  const { configured, admin } = authState(req);
  if (!keyOk && !(configured && admin)) return res.status(401).json({ error: 'Not authorized' });
  if (!SHEET_ID) return res.status(500).json({ error: 'MUSIC_SHEET_ID not set' });

  try {
    const token = await getToken();
    const sheet = await sheetGet(token, 'Clients!A1:ZZ');
    const rows = sheet.values || [];
    const headers = (rows[0] || []).map(h => String(h || '').trim());
    const col = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const nameC = col('Name'), urlC = col('Spotify URL'), mlC = col('Spotify Monthly Listeners');
    if (nameC < 0 || urlC < 0) return res.status(500).json({ error: 'Name / Spotify URL columns not found' });
    if (mlC < 0) return res.status(500).json({ error: 'Spotify Monthly Listeners column not found' });

    // Artist-profile clients only (songwriter/producer pages have no listeners).
    const artists = [];
    let skippedNonArtist = 0;
    rows.slice(1).forEach((r, i) => {
      const name = String(r[nameC] || '').trim();
      if (!name) return;
      const url = String(r[urlC] || '').trim();
      const m = url.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/);
      if (m) artists.push({ row: i + 2, name, artistId: m[1] });
      else if (url) skippedNonArtist++;
    });

    // 1) Monthly listeners → sheet column + history tab.
    const writes = [], history = [], errors = [];
    const today = new Date().toISOString().slice(0, 10);
    await runPool(artists, 5, async (a) => {
      try {
        const n = await fetchMonthlyListeners(a.artistId);
        if (n != null && n > 0) {
          writes.push({ range: `Clients!${colLetter(mlC + 1)}${a.row}`, values: [[n]] });
          history.push([today, a.name, n]);
        } else errors.push(a.name);
      } catch { errors.push(a.name); }
    });
    if (writes.length) {
      await sheetBatchWrite(token, writes);
      await ensureHistoryTab(token);
      await sheetAppend(token, 'ListenerHistory!A:C', history);
    }

    // 2) Releases cache → fresh Friday snapshot in the shared blob store.
    let releasesRefreshed = 0, releasesSkipped = false;
    const apiToken = await getSpotifyApiToken();
    if (apiToken) {
      const cache = await loadBlobCache(RELEASES_CACHE_PATH);
      let dirty = false, rateLimited = false;
      await runPool(artists, 5, async (a) => {
        if (rateLimited) return;
        try {
          const out = await fetchReleases(a.artistId, apiToken);
          if (out?.rateLimited) { rateLimited = true; return; }
          if (out?.releases) {
            cache[a.artistId] = { data: out.releases, fetchedAt: Date.now() };
            dirty = true; releasesRefreshed++;
          }
        } catch { /* keep the old cache entry */ }
      });
      if (dirty) await saveBlobCache(RELEASES_CACHE_PATH, cache);
      if (rateLimited) releasesSkipped = true;
    } else releasesSkipped = true;

    return res.json({
      ok: true,
      artistProfiles: artists.length,
      skippedNonArtist,
      listenersWritten: writes.length,
      listenerErrors: errors,
      releasesRefreshed,
      releasesSkipped,
    });
  } catch (err) {
    console.error('refresh-music error:', err);
    return res.status(500).json({ error: err.message });
  }
};
