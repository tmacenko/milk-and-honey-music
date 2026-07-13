const crypto = require('crypto');

const SHEET_ID = process.env.MUSIC_SHEET_ID;
const BLOB_API = 'https://blob.vercel-storage.com';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const RELEASES_CACHE_PATH = 'spotify-releases-cache.json';
// v3 -- entries now also hold artists' popular tracks (topTracks); new path
// forces a clean repopulate since the shape changed again.
const MEDIA_CACHE_PATH = 'spotify-media-cache-v4.json';
// Track album art never changes, so it's cached separately and long-lived,
// reused across artists (collabs overlap) and across weekly media rebuilds.
const TRACK_ART_CACHE_PATH = 'spotify-track-art-cache.json';

// Persisted in Vercel Blob (not just in-memory) so the cache survives cold
// starts -- a 1-week TTL is pointless if a function restart wipes it.
const RELEASES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week -- new releases land on Fridays
// Resolved photos + song credits from Spotify. Re-resolving on every load was the
// main cause of slow API responses; song credits shift week to week by streams.
const MEDIA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
// In-memory, module-level: cheap same-instance guard against re-hammering
// Spotify with more requests while already rate-limited.
let spotifyBlockedUntil = 0;

async function loadBlobCache(path) {
  if (!BLOB_TOKEN) return {};
  try {
    const params = new URLSearchParams({ prefix: path, limit: '1' });
    const r = await fetch(`${BLOB_API}?${params}`, {
      headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7' },
    });
    if (!r.ok) return {};
    const list = await r.json();
    const blob = list.blobs?.[0];
    if (!blob) return {};
    const data = await fetch(blob.url);
    if (!data.ok) return {};
    return await data.json();
  } catch { return {}; }
}

async function saveBlobCache(path, cache) {
  if (!BLOB_TOKEN) return;
  try {
    await fetch(`${BLOB_API}/${path}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7',
        'content-type': 'application/json', 'x-add-random-suffix': '0',
      },
      body: JSON.stringify(cache),
    });
  } catch(e) { console.error(`Blob cache save error (${path}):`, e.message); }
}

// ── Songwriter / producer song credits ─────────────────────────────────────────
// Spotify's Web API blocks the useful endpoints for Development Mode apps, but a
// songwriter/producer credit page (artists.spotify.com/{role}/{id}) embeds the
// full list of songs they've worked on in its __NEXT_DATA__ JSON, pre-sorted by
// streams. We already fetch that page for the profile photo, so the song credits
// come from the same request at no extra cost.
const SPOTIFY_B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gidToSpotifyId(gid) {
  if (!gid || !/^[0-9a-f]{32}$/i.test(gid)) return null;
  let n = BigInt('0x' + gid);
  let out = '';
  while (n > 0n) { out = SPOTIFY_B62[Number(n % 62n)] + out; n = n / 62n; }
  return out.padStart(22, '0');
}
function parseCreditSongs(html) {
  try {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return [];
    const props = JSON.parse(m[1]).props?.pageProps || {};
    // Find a *Profile object holding a recordings array (writerProfile / producerProfile).
    let recordings = null;
    for (const k of Object.keys(props)) {
      if (props[k] && Array.isArray(props[k].recordings)) { recordings = props[k].recordings; break; }
    }
    if (!recordings) return [];
    return recordings
      .filter(r => r && r.title)
      .sort((a, b) => (b.totalStreams || 0) - (a.totalStreams || 0))
      .slice(0, 8)
      .map(r => {
        const id = gidToSpotifyId(r.gid);
        return {
          title:   r.title,
          artist:  r.artistName || r.artists?.[0]?.name || '',
          artwork: r.coverart300 || r.coverart640 || null,
          year:    r.releaseDate?.year || null,
          streams: r.totalStreams || null,
          url:     id ? `https://open.spotify.com/track/${id}` : null,
        };
      });
  } catch { return []; }
}

// The artist embed page (open.spotify.com/embed/artist/{id}) is a light Next.js
// page whose __NEXT_DATA__ carries the artist's photo AND their popular tracks
// (the Web API's popularity ordering is blocked, but this isn't). Per-track album
// art isn't in this data, so it's fetched separately (and cached).
function parseArtistEmbed(html) {
  try {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return { photoUrl: null, tracks: [], token: null };
    const pp = JSON.parse(m[1]).props?.pageProps || {};
    const e = pp.state?.data?.entity || {};
    const img = (e.visualIdentity?.image || []).slice().sort((a, b) => (b.maxWidth || 0) - (a.maxWidth || 0))[0];
    const photoUrl = img && img.url && /scdn\.co|spotifycdn\.com/.test(img.url) ? img.url : null;
    const tracks = (e.trackList || [])
      .filter(t => t && t.title)
      .slice(0, 8)
      .map(t => ({ title: t.title, artist: t.subtitle || '', id: String(t.uri || '').split(':').pop() }))
      .filter(t => t.id);
    // The embed page carries an anonymous web access token we can reuse to reach
    // the artist header banner (not exposed anywhere in the public HTML/API).
    const token = pp.state?.settings?.session?.accessToken || null;
    return { photoUrl, tracks, token };
  } catch { return { photoUrl: null, tracks: [], token: null }; }
}

// Fetch an artist's header/banner image via Spotify's internal GraphQL, reusing
// the anonymous token from the embed page. Degrades to null on any failure (e.g.
// the persisted-query hash rotating), so a missing banner never breaks the page.
const ARTIST_OVERVIEW_HASH = '4bc52527bb77a5f8bbb9afe491e9aa725698d29ab73bff58d49169ee29800167';
async function fetchArtistHeader(artistId, token) {
  if (!token) return null;
  try {
    const r = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        operationName: 'queryArtistOverview',
        variables: { uri: `spotify:artist:${artistId}`, locale: '', includePrerelease: true },
        extensions: { persistedQuery: { version: 1, sha256Hash: ARTIST_OVERVIEW_HASH } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const url = j?.data?.artistUnion?.visuals?.headerImage?.sources?.[0]?.url;
    return url && /scdn\.co|spotifycdn\.com/.test(url) ? url : null;
  } catch { return null; }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function b64url(str) { return Buffer.from(str).toString('base64url'); }

async function getToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(key.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Sheets helpers ────────────────────────────────────────────────────────────
async function sheetGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error(`Sheets API error on "${range}": ${data.error.code} ${data.error.message}`);
  return data;
}

async function sheetUpdate(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return r.json();
}

async function sheetAppend(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return r.json();
}

// ── Column map: Clients!A:V ───────────────────────────────────────────────────
// A  Name
// B  Type                (Songwriter, Producer, Artist -- comma-separated)
// C  Contact             (MH agent/rep)
// D  City 1
// E  State 1
// F  Country 1
// G  City 2
// H  State 2
// I  Country 2
// J  City 3
// K  State 3
// L  Country 3
// M  PRO                 (BMI, ASCAP, SESAC, etc.)
// N  Publisher
// O  Record Label
// P  Artists Worked With (comma-separated)
// Q  Bio
// R  Photo URL
// S  Instagram
// T  Twitter/X
// U  TikTok
// V  Spotify Monthly Listeners
// W  Spotify URL
// X  Apple Music URL
// Y  SoundCloud URL
// Z  Notes               (internal only)
// AA Onboarded At
// AB Spotify Artist ID

function parseClient(row, idx) {
  const g = col => String(row[col] ?? '').trim();
  const name = g('Name');
  if (!name) return null;
  return {
    _rowIndex:    idx + 2,
    id:           name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    types:        g('Type') ? g('Type').split(',').map(s => s.trim()).filter(Boolean) : [],
    contact:      g('Contact'),
    city:         g('City 1'),
    state:        g('State 1'),
    country:      g('Country 1'),
    city2:        g('City 2'),
    state2:       g('State 2'),
    country2:     g('Country 2'),
    city3:        g('City 3'),
    state3:       g('State 3'),
    country3:     g('Country 3'),
    pro:          g('PRO'),
    publisher:    g('Publisher'),
    label:        g('Record Label'),
    credits:      g('Artists Worked With') ? g('Artists Worked With').split(',').map(s => s.trim()).filter(Boolean) : [],
    supporters:   g('Supporters') ? g('Supporters').split(',').map(s => s.trim()).filter(Boolean) : [],
    keyShows:     (g('Key Shows') || g('Top Shows')) ? (g('Key Shows') || g('Top Shows')).split(',').map(s => s.trim()).filter(Boolean) : [],
    bio:          g('Bio'),
    photoUrl:     g('Photo URL'),
    instagram:    g('Instagram').replace(/^@/, ''),
    twitter:      g('Twitter/X').replace(/^@/, ''),
    tiktok:       g('TikTok').replace(/^@/, ''),
    youtube:      g('YouTube'),
    spotifyMonthly: g('Spotify Monthly Listeners'),
    spotifyUrl:   g('Spotify URL'),
    appleMusicUrl: g('Apple Music URL'),
    soundcloudUrl: g('SoundCloud URL'),
    notes:        g('Notes'),
    onboardedAt:  g('Onboarded At'),
    spotifyId:    g('Spotify Artist ID'),
  };
}

// Serialize one client field for a given sheet header. Returns undefined for
// headers we don't manage, so callers can preserve those cells untouched. This
// is keyed by header NAME (not position), so columns can be reordered or
// removed in the sheet without breaking writes.
function serializeField(header, c) {
  const handle = h => h ? (h.startsWith('@') ? h : '@' + h) : '';
  const map = {
    'Name':                      c.name,
    'Type':                      (c.types || []).join(', ') || c.type,
    'Contact':                   c.contact,
    'City 1':    c.city,  'State 1':  c.state,  'Country 1': c.country,
    'City 2':    c.city2, 'State 2':  c.state2, 'Country 2': c.country2,
    'City 3':    c.city3, 'State 3':  c.state3, 'Country 3': c.country3,
    'PRO':       c.pro,   'Publisher': c.publisher, 'Record Label': c.label,
    'Artists Worked With':       (c.credits || []).join(', '),
    'Supporters':                (c.supporters || []).join(', '),
    'Key Shows':                 (c.keyShows || []).join(', '),
    'Top Shows':                 (c.keyShows || []).join(', '),
    'Bio':                       c.bio,
    'Photo URL':                 c.photoUrl,
    'Instagram': handle(c.instagram), 'Twitter/X': handle(c.twitter), 'TikTok': handle(c.tiktok),
    'YouTube':                   c.youtube,
    'Spotify Monthly Listeners': c.spotifyMonthly,
    'Spotify URL':               c.spotifyUrl,
    'Apple Music URL':           c.appleMusicUrl,
    'SoundCloud URL':            c.soundcloudUrl,
    'Notes':                     c.notes,
    'Onboarded At':              c.onboardedAt,
    'Spotify Artist ID':         c.spotifyId,
  };
  return header in map ? (map[header] ?? '') : undefined;
}

// 1-based column count -> A1 column letter (1->A, 26->Z, 27->AA).
function colLetter(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s || 'A';
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getToken();

    // ── GET: load clients + logos ────────────────────────────────────────────
    if (req.method === 'GET') {
      const [clientData, logoData, staffData] = await Promise.all([
        sheetGet(token, 'Clients!A:AB'),
        sheetGet(token, 'Logos!A:F').catch(() => ({ values: [] })),
        sheetGet(token, 'Staff!A:B').catch(() => ({ values: [] })),
      ]);

      // Parse clients
      const rows = clientData?.values || [];
      if (rows.length < 2) return res.json({ clients: [], logos: {} });
      const headers = rows[0].map(h => String(h || '').trim());
      const clients = rows.slice(1).map((row, i) => {
        const obj = { _rowIndex: i + 2 };
        headers.forEach((h, j) => { obj[h] = String(row[j] ?? '').trim(); });
        return parseClient(obj, i);
      }).filter(Boolean);

      // ── Spotify Web API enrichment ────────────────────────────────────────────
      // As of Feb 2026, Development Mode apps (this one -- Extended Quota Mode
      // requires 250k+ MAU and a launched public service, not applicable here)
      // lost Get Several Artists, Get Artist's Top Tracks, and the
      // followers/popularity/genres fields entirely, with no workaround via a
      // different auth flow. Get Artist's Albums is still available, so latest
      // release enrichment uses that instead.
      let spotifyToken = null;
      try {
        const cid  = process.env.SPOTIFY_CLIENT_ID;
        const csec = process.env.SPOTIFY_CLIENT_SECRET;
        if (cid && csec) {
          const creds = Buffer.from(`${cid}:${csec}`).toString('base64');
          const tr = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=client_credentials',
          });
          const td = await tr.json();
          spotifyToken = td.access_token || null;
        }
      } catch(e) { console.error('Spotify auth error:', e.message); }

      // ── Spotify media enrichment (photo + song credits), cached ─────────────
      // Resolved from each client's Spotify URL, cached in Vercel Blob so we don't
      // re-fetch on every load (re-resolving was the main cause of slow responses):
      //   open.spotify.com/artist/{id}     -> oEmbed thumbnail (photo only)
      //   artists.spotify.com/{role}/{id}  -> one ~500KB page scrape yields BOTH
      //     the og:image photo AND the top song credits (__NEXT_DATA__).
      const mediaCache = await loadBlobCache(MEDIA_CACHE_PATH);
      const trackArtCache = await loadBlobCache(TRACK_ART_CACHE_PATH);
      let mediaCacheDirty = false, trackArtDirty = false;
      const now = Date.now();

      const applyHit = (c, hit) => {
        if (hit.photoUrl && !c.photoUrl?.trim()) c.photoUrl = hit.photoUrl;
        if (hit.songs?.length) c.spotifySongCredits = hit.songs;
        if (hit.topTracks?.length) c.spotifyTopTracks = hit.topTracks;
        if (hit.headerUrl) c.headerUrl = hit.headerUrl;
      };

      // Apply fresh cache hits up front; collect the rest to resolve.
      const toResolve = [];
      for (const c of clients) {
        const url = c.spotifyUrl || '';
        const isArtist = url.includes('open.spotify.com/artist/');
        const isCredit = /artists\.spotify\.com\/(songwriter|producer)\//.test(url);
        if (!isArtist && !isCredit) continue;
        const hit = mediaCache[url];
        if (hit && now - hit.fetchedAt < MEDIA_CACHE_TTL_MS) { applyHit(c, hit); continue; }
        toResolve.push({ c, url, isArtist });
      }

      // Artist popular tracks come from the light embed page (one fetch: photo +
      // top tracks). Per-track album art is NOT fetched here -- it's resolved
      // separately and bounded (below), because the oEmbed art endpoint is slow.
      const resolveArtist = async (url) => {
        const m = url.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/);
        if (!m) return { photoUrl: null, songs: [], topTracks: [], headerUrl: null };
        try {
          const r = await fetch(`https://open.spotify.com/embed/artist/${m[1]}`, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) return { photoUrl: null, songs: [], topTracks: [], headerUrl: null };
          const { photoUrl, tracks, token } = parseArtistEmbed(await r.text());
          const topTracks = tracks.map(t => ({ title: t.title, artist: t.artist, id: t.id, url: `https://open.spotify.com/track/${t.id}` }));
          const headerUrl = await fetchArtistHeader(m[1], token);
          return { photoUrl, songs: [], topTracks, headerUrl };
        } catch(e) {}
        return { photoUrl: null, songs: [], topTracks: [], headerUrl: null };
      };
      const resolveCredit = async (url) => {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
          if (!r.ok) return { photoUrl: null, songs: [], topTracks: [], headerUrl: null };
          const html = await r.text();
          let photoUrl = null;
          const tag = html.match(/<meta[^>]*property=["']og:image["'][^>]*>/i);
          const cm = tag && tag[0].match(/content=["']([^"']+)["']/i);
          const img = cm && cm[1];
          if (img && img.startsWith('http') && /scdn\.co|spotifycdn\.com/.test(img)) photoUrl = img;
          return { photoUrl, songs: parseCreditSongs(html), topTracks: [], headerUrl: null };
        } catch(e) {}
        return { photoUrl: null, songs: [], topTracks: [], headerUrl: null };
      };

      // Resolve cache misses in small concurrent chunks; save after each chunk so
      // a cold-rebuild timeout never loses progress (next request resumes).
      for (let i = 0; i < toResolve.length; i += 4) {
        await Promise.all(toResolve.slice(i, i + 4).map(async ({ c, url, isArtist }) => {
          const res = isArtist ? await resolveArtist(url) : await resolveCredit(url);
          applyHit(c, res);
          mediaCache[url] = { photoUrl: res.photoUrl || null, songs: res.songs || [], topTracks: res.topTracks || [], headerUrl: res.headerUrl || null, fetchedAt: now };
          mediaCacheDirty = true;
        }));
        if (mediaCacheDirty) { await saveBlobCache(MEDIA_CACHE_PATH, mediaCache); mediaCacheDirty = false; }
      }

      // Attach album art to popular tracks from the long-lived track-art cache,
      // and best-effort resolve a bounded number of missing ones this request
      // (art never changes, so it accumulates over a few loads without hammering
      // the slow oEmbed endpoint). Only definitive results are cached.
      const needArt = [];
      for (const c of clients) {
        for (const t of (c.spotifyTopTracks || [])) {
          if (t.id && !(t.id in trackArtCache) && !needArt.includes(t.id)) needArt.push(t.id);
        }
      }
      const artBudget = needArt.slice(0, 48);
      for (let i = 0; i < artBudget.length; i += 8) {
        await Promise.all(artBudget.slice(i, i + 8).map(async id => {
          try {
            const r = await fetch(`https://open.spotify.com/oembed?url=spotify:track:${id}`, { signal: AbortSignal.timeout(5000) });
            if (r.ok) { const d = await r.json(); trackArtCache[id] = d.thumbnail_url || null; trackArtDirty = true; }
          } catch(e) {}
        }));
      }
      if (trackArtDirty) await saveBlobCache(TRACK_ART_CACHE_PATH, trackArtCache);
      for (const c of clients) {
        if (c.spotifyTopTracks?.length) {
          c.spotifyTopTracks = c.spotifyTopTracks.map(t => ({ title: t.title, artist: t.artist, artwork: trackArtCache[t.id] || null, url: t.url }));
        }
      }

      if (spotifyToken) {
        const spotifyClients = clients.filter(c => c.spotifyUrl?.includes('open.spotify.com/artist/'));
        const persistedCache = await loadBlobCache(RELEASES_CACHE_PATH);
        let cacheDirty = false;

        const CHUNK_SIZE = 8;
        for (let i = 0; i < spotifyClients.length; i += CHUNK_SIZE) {
          const chunk = spotifyClients.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async c => {
            const m = c.spotifyUrl.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/);
            if (!m) return;
            const artistId = m[1];

            const cached = persistedCache[artistId];
            if (cached) c.spotifyRecentReleases = cached.data;
            if (cached && Date.now() - cached.fetchedAt < RELEASES_CACHE_TTL_MS) return;
            if (Date.now() < spotifyBlockedUntil) return; // rate-limited -- serve cache (if any) and skip

            try {
              const ar = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=10`, {
                headers: { Authorization: `Bearer ${spotifyToken}` }
              });
              if (ar.status === 429) {
                const retryAfterSec = parseInt(ar.headers.get('retry-after') || '3600', 10);
                spotifyBlockedUntil = Date.now() + retryAfterSec * 1000;
                return;
              }
              if (ar.ok) {
                const d = await ar.json();
                const releases = (d.items || [])
                  .filter(a => a?.release_date)
                  .sort((x, y) => new Date(y.release_date) - new Date(x.release_date))
                  .slice(0, 8)
                  .map(a => ({
                    name:        a.name,
                    type:        a.album_type,
                    artwork:     a.images?.[0]?.url,
                    releaseDate: a.release_date,
                    url:         a.external_urls?.spotify,
                  }));
                c.spotifyRecentReleases = releases;
                persistedCache[artistId] = { data: releases, fetchedAt: Date.now() };
                cacheDirty = true;
              }
            } catch(e) { console.error(`Spotify enrichment error for ${c.name}:`, e.message); }
          }));
        }
        if (cacheDirty) await saveBlobCache(RELEASES_CACHE_PATH, persistedCache);
      }

      // Parse logos -- structure: Record Label | Label URL | Publishing Company | Pub URL | PRO | PRO URL
      const logoRows = logoData?.values || [];
      const logos = {};
      logoRows.slice(1).forEach(row => {
        const labelName = String(row[0] ?? '').trim();
        const labelUrl  = String(row[1] ?? '').trim();
        const pubName   = String(row[2] ?? '').trim();
        const pubUrl    = String(row[3] ?? '').trim();
        const proName   = String(row[4] ?? '').trim();
        const proUrl    = String(row[5] ?? '').trim();
        if (labelName && labelUrl) logos[labelName.toLowerCase()] = { url: labelUrl, category: 'Label' };
        if (pubName && pubUrl)     logos[pubName.toLowerCase()]   = { url: pubUrl,   category: 'Publisher' };
        if (proName && proUrl)     logos[proName.toLowerCase()]   = { url: proUrl,   category: 'PRO' };
      });

      // Parse staff -- Name | Email
      const staffRows = staffData?.values || [];
      const staff = {};
      staffRows.slice(1).forEach(row => {
        const name  = String(row[0] ?? '').trim();
        const email = String(row[1] ?? '').trim();
        if (name && email) staff[name.toLowerCase()] = { name, email };
      });

      return res.json({ clients, logos, staff });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {

      // Chat proxy
      if (req.body?.action === 'chat') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
        const { messages, system } = req.body;
        if (!messages?.length) return res.status(400).json({ error: 'Missing messages' });
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, system: system || '', messages }),
        });
        if (!response.ok) {
          const err = await response.text();
          return res.status(response.status).json({ error: `Anthropic error: ${err.slice(0, 200)}` });
        }
        const data = await response.json();
        const raw = data.content?.[0]?.text || '';
        // CSV export detection
        try {
          const clean = raw.replace(/```(?:json)?/gi, '').trim();
          const jsonStart = clean.indexOf('{'), jsonEnd = clean.lastIndexOf('}');
          if (jsonStart > -1 && jsonEnd > jsonStart) {
            const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
            if (parsed.export === true && Array.isArray(parsed.rows) && parsed.rows.length) {
              const keys = Object.keys(parsed.rows[0]);
              const csvLines = [keys.join(','), ...parsed.rows.map(r => keys.map(k => '"' + String(r[k] == null ? '' : r[k]).replace(/"/g, '""') + '"').join(','))];
              return res.json({ export: true, filename: parsed.filename || 'export.csv', csv: csvLines.join('\n'), rowCount: parsed.rows.length });
            }
          }
        } catch(e) {}
        return res.json({ text: raw });
      }

      // Save / create client. Rows are built against the live header row (by
      // name), so the sheet's columns can be reordered or trimmed freely.
      const { action, client: c } = req.body;
      if (!c?.name) return res.status(400).json({ error: 'Missing client name' });
      const headerRes = await sheetGet(token, 'Clients!1:1');
      const headers = (headerRes.values?.[0] || []).map(h => String(h || '').trim());
      if (!headers.length) return res.status(500).json({ error: 'Could not read sheet headers' });
      const lastCol = colLetter(headers.length);

      if (action === 'create') {
        const row = headers.map(h => { const v = serializeField(h, c); return v === undefined ? '' : v; });
        await sheetAppend(token, `Clients!A:${lastCol}`, [row]);
      } else {
        if (!c._rowIndex) return res.status(400).json({ error: 'Missing row index' });
        // Preserve any columns we don't manage by reading the existing row first.
        const existingRes = await sheetGet(token, `Clients!A${c._rowIndex}:${lastCol}${c._rowIndex}`);
        const existing = existingRes.values?.[0] || [];
        const row = headers.map((h, i) => { const v = serializeField(h, c); return v === undefined ? (existing[i] ?? '') : v; });
        await sheetUpdate(token, `Clients!A${c._rowIndex}:${lastCol}${c._rowIndex}`, [row]);
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Music sheets error:', err);
    return res.status(500).json({ error: err.message });
  }
};
