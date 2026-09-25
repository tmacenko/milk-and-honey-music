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
//   2. Recent releases: refreshes each artist's latest albums/singles in the
//      Vercel Blob releases cache so the dashboard's "Recent releases" tile is
//      fresh every Friday (release day). Releases come from the same artist-
//      overview call that carries monthly listeners — NOT the official Web
//      API, whose rate limit cut the 2026-09-25 run off after 5 of 43 artists.
//      The Web API is only a per-artist fallback, and a 429 there no longer
//      ends the pass for everyone else.
//
// ?mode=releases — releases-only catch-up (Friday backup cron, manual
// re-runs): skips artists refreshed in the last 6h and never touches the
// listener column or ListenerHistory. Every run logs a one-line summary so a
// partial run shows up as partial instead of a silent 200.
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
// The full artist page bot-walls datacenter IPs, but the light embed page does
// not, and it carries an anonymous web token that Spotify's own internal
// GraphQL accepts — the same working pattern api/sheets.js uses for artist
// header banners. queryArtistOverview's stats block has the exact count.
const ARTIST_OVERVIEW_HASH = '4bc52527bb77a5f8bbb9afe491e9aa725698d29ab73bff58d49169ee29800167';
async function getAnonToken(artistId) {
  const r = await fetch(`https://open.spotify.com/embed/artist/${artistId}`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) return null;
  const m = (await r.text()).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]).props?.pageProps?.state?.settings?.session?.accessToken || null; } catch { return null; }
}
// Discography block of the overview → the releases-cache shape the dashboard
// already reads ({name,type,artwork,releaseDate,url}, newest first, max 8).
function overviewReleases(disc) {
  const seen = new Set(), out = [];
  const pad = n => String(n).padStart(2, '0');
  const add = (rel) => {
    if (!rel || !rel.id || seen.has(rel.id) || !rel.date?.year) return;
    seen.add(rel.id);
    const d = rel.date;
    const srcs = [...(rel.coverArt?.sources || [])].sort((a, b) => (b.width || 0) - (a.width || 0));
    out.push({
      name: rel.name || '',
      type: String(rel.type || '').toLowerCase(),
      artwork: srcs[0]?.url,
      releaseDate: d.precision === 'YEAR' ? String(d.year) : d.precision === 'MONTH' ? `${d.year}-${pad(d.month)}` : `${d.year}-${pad(d.month)}-${pad(d.day)}`,
      url: `https://open.spotify.com/album/${rel.id}`,
    });
  };
  if (!disc) return null;
  add(disc.latest);
  for (const k of ['singles', 'albums']) for (const it of disc[k]?.items || []) add(it?.releases?.items?.[0]);
  if (!out.length) return null;
  return out.sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate))).slice(0, 8);
}
async function fetchOverview(artistId, anonToken) {
  if (!anonToken) return null;
  const r = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
    method: 'POST',
    headers: { authorization: `Bearer ${anonToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      operationName: 'queryArtistOverview',
      variables: { uri: `spotify:artist:${artistId}`, locale: '', includePrerelease: true },
      extensions: { persistedQuery: { version: 1, sha256Hash: ARTIST_OVERVIEW_HASH } },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const a = j?.data?.artistUnion;
  if (!a) return null;
  const n = a.stats?.monthlyListeners;
  return { listeners: Number.isFinite(n) && n > 0 ? n : null, releases: overviewReleases(a.discography) };
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
    const nameC = col('Name'), urlC = col('Spotify URL');
    let mlC = col('Spotify Monthly Listeners');
    if (nameC < 0 || urlC < 0) return res.status(500).json({ error: 'Name / Spotify URL columns not found' });
    if (mlC < 0) {
      // First run: the sheet never had this column — grow the grid by one
      // column, then add the header after the last existing one.
      mlC = headers.length;
      const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      const props = (meta.sheets || []).map(s => s.properties).find(p => p && p.title === 'Clients');
      if (!props) return res.status(500).json({ error: 'Clients tab not found' });
      if ((props.gridProperties?.columnCount || 0) <= mlC) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ appendDimension: { sheetId: props.sheetId, dimension: 'COLUMNS', length: 1 } }] }),
        });
      }
      await sheetBatchWrite(token, [{ range: `Clients!${colLetter(mlC + 1)}1`, values: [['Spotify Monthly Listeners']] }]);
    }

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

    const releasesOnly = req.query?.mode === 'releases';
    const RECENT_MS = 6 * 60 * 60 * 1000;
    const cache = await loadBlobCache(RELEASES_CACHE_PATH);
    const needsReleases = (a) => !(releasesOnly && cache[a.artistId] && Date.now() - (cache[a.artistId].fetchedAt || 0) < RECENT_MS);

    // One overview call per artist feeds both the listener count and the
    // releases. One anonymous token (from the embed page) covers them all.
    const writes = [], history = [], errors = [];
    const today = new Date().toISOString().slice(0, 10);
    const todo = artists.filter(a => !releasesOnly || needsReleases(a));
    const anonToken = todo.length ? await getAnonToken(todo[0].artistId) : null;
    const overview = {};
    await runPool(todo, 5, async (a) => {
      try {
        const ov = await fetchOverview(a.artistId, anonToken);
        overview[a.artistId] = ov;
        if (releasesOnly) return;
        if (ov?.listeners) {
          writes.push({ range: `Clients!${colLetter(mlC + 1)}${a.row}`, values: [[ov.listeners]] });
          history.push([today, a.name, ov.listeners]);
        } else errors.push(a.name);
      } catch { if (!releasesOnly) errors.push(a.name); }
    });
    if (writes.length) {
      await sheetBatchWrite(token, writes);
      await ensureHistoryTab(token);
      // A second run on the same day must not double-count the history.
      const prior = ((await sheetGet(token, 'ListenerHistory!A:B')).values || [])
        .filter(r => r[0] === today).map(r => String(r[1] || '').toLowerCase());
      const fresh = history.filter(h => !prior.includes(String(h[1]).toLowerCase()));
      if (fresh.length) await sheetAppend(token, 'ListenerHistory!A:C', fresh);
    }

    // Releases: overview first; the official Web API only for artists whose
    // overview came back without a discography. A 429 there stops further
    // API calls, never the overview-sourced ones.
    let fromOverview = 0, fromApi = 0, alreadyFresh = 0, apiRateLimited = false;
    const releaseMisses = [];
    let apiToken;
    for (const a of artists) {
      if (!needsReleases(a)) { alreadyFresh++; continue; }
      let rel = overview[a.artistId]?.releases || null;
      if (rel) fromOverview++;
      else if (!apiRateLimited) {
        if (apiToken === undefined) apiToken = await getSpotifyApiToken();
        const out = apiToken ? await fetchReleases(a.artistId, apiToken).catch(() => null) : null;
        if (out?.rateLimited) apiRateLimited = true;
        else if (out?.releases) { rel = out.releases; fromApi++; }
      }
      if (rel) cache[a.artistId] = { data: rel, fetchedAt: Date.now() };
      else releaseMisses.push(a.name);
    }
    const releasesRefreshed = fromOverview + fromApi;
    if (releasesRefreshed) await saveBlobCache(RELEASES_CACHE_PATH, cache);
    const releasesSkipped = releaseMisses.length > 0;

    console.log(`refresh-music${releasesOnly ? ' (releases-only)' : ''}: releases ${releasesRefreshed + alreadyFresh}/${artists.length} current`
      + ` (${fromOverview} overview, ${fromApi} web-api, ${alreadyFresh} already fresh)`
      + (releaseMisses.length ? ` — MISSED ${releaseMisses.length}: ${releaseMisses.join(', ')}` : '')
      + (apiRateLimited ? ' — web-api rate-limited' : '')
      + (releasesOnly ? '' : ` | listeners ${writes.length}/${artists.length}`));

    return res.json({
      ok: true,
      mode: releasesOnly ? 'releases' : 'full',
      artistProfiles: artists.length,
      skippedNonArtist,
      listenersWritten: writes.length,
      listenerErrors: errors,
      releasesRefreshed,
      releasesAlreadyFresh: alreadyFresh,
      releasesFromOverview: fromOverview,
      releasesFromWebApi: fromApi,
      releasesMissed: releaseMisses,
      webApiRateLimited: apiRateLimited,
      releasesSkipped,
    });
  } catch (err) {
    console.error('refresh-music error:', err);
    return res.status(500).json({ error: err.message });
  }
};
