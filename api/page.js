// api/page.js — serves the public one-sheet at /{slug}.
//   Real browsers → the SPA shell (index.html); the app resolves the slug itself.
//   Crawlers (Slack/iMessage/Twitter/etc.) → OG-tagged HTML for the public client.
// Private clients never get OG data (only Public rows are looked up).
const crypto = require('crypto');

const SHEET_ID = process.env.MUSIC_SHEET_ID;
const BLOB_API = 'https://blob.vercel-storage.com';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const MEDIA_CACHE_PATH = 'spotify-media-cache-v4.json';
// Canonical production domain. Hardcoded (not env-driven) so generated links
// and OG tags always use the live domain, regardless of stale Vercel env vars.
// If the domain ever changes, update it here (and in share.js / share-og.js).
const APP_URL = 'https://www.milkandhoneyfamily.com';
const OG_IMAGE = `${APP_URL}/share-image.jpg`;

const BOT_AGENTS = [
  'facebookexternalhit', 'twitterbot', 'linkedinbot', 'slackbot', 'whatsapp',
  'telegrambot', 'discordbot', 'applebot', 'googlebot', 'bingbot', 'yandex',
  'msnbot', 'preview', 'unfurl', 'embed', 'crawler', 'spider', 'bot/', 'curl',
  'wget', 'python-requests', 'axios',
];
const isCrawler = ua => !!ua && BOT_AGENTS.some(b => ua.toLowerCase().includes(b));

const slugOf = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isPublic = v => ['true', 'yes', '1', 'x', 'y', '✓'].includes(String(v || '').trim().toLowerCase());
const b64url = s => Buffer.from(s).toString('base64url');

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
  if (!data.access_token) throw new Error('Auth failed');
  return data.access_token;
}

async function sheetGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function loadBlob(pathname) {
  try {
    const params = new URLSearchParams({ prefix: pathname, limit: '1' });
    const r = await fetch(`${BLOB_API}?${params}`, { headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7' } });
    if (!r.ok) return {};
    const blob = (await r.json()).blobs?.[0];
    if (!blob) return {};
    const d = await fetch(blob.url);
    return d.ok ? d.json() : {};
  } catch { return {}; }
}

let cachedShell = null;
async function getShell() {
  if (cachedShell) return cachedShell;
  const r = await fetch(`${APP_URL}/index.html`);
  cachedShell = await r.text();
  return cachedShell;
}

module.exports = async (req, res) => {
  const slug = slugOf(req.query.slug || '');
  const ua = req.headers['user-agent'] || '';

  // Browsers get the real app shell; the SPA reads the path and opens the client.
  if (!isCrawler(ua)) {
    try {
      const shell = await getShell();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(shell);
    } catch {
      return res.redirect(302, `${APP_URL}/?client=${encodeURIComponent(slug)}`);
    }
  }

  // Crawlers: emit OG tags for the public client (defaults if not found/private).
  let title = 'Milk & Honey Music', description = 'Milk & Honey Music roster', image = OG_IMAGE;
  try {
    const token = await getToken();
    const rows = (await sheetGet(token, 'Clients!A:AZ')).values || [];
    const headers = (rows[0] || []).map(h => String(h || '').trim());
    const idx = n => headers.findIndex(h => h.toLowerCase() === n.toLowerCase());
    const iName = idx('Name'), iPublic = idx('Public'), iBio = idx('Bio'), iPhoto = idx('Photo URL'), iSpotify = idx('Spotify URL'), iType = idx('Type');
    const row = rows.slice(1).find(r => slugOf(r[iName]) === slug && (iPublic < 0 || isPublic(r[iPublic])));
    if (row) {
      const name = String(row[iName] || '').trim();
      title = `${name} — Milk & Honey Music`;
      const type = iType >= 0 ? String(row[iType] || '').split(',').map(s => s.trim()).filter(Boolean).join(' · ') : '';
      const bio = iBio >= 0 ? String(row[iBio] || '').trim() : '';
      description = bio ? bio.slice(0, 180) : (type || 'Milk & Honey Music');
      let img = iPhoto >= 0 ? String(row[iPhoto] || '').trim() : '';
      if (!img && iSpotify >= 0) {
        const hit = (await loadBlob(MEDIA_CACHE_PATH))[String(row[iSpotify] || '').trim()];
        img = hit?.headerUrl || hit?.photoUrl || '';
      }
      if (img) image = img;
    }
  } catch { /* defaults */ }

  const pageUrl = `${APP_URL}/${slug}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Vary', 'User-Agent');
  return res.send(`<!DOCTYPE html><html><head>
<meta charset="UTF-8" />
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:url" content="${esc(pageUrl)}" />
<meta property="og:type" content="profile" />
<meta property="og:site_name" content="Milk &amp; Honey Music" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
</head><body><a href="${esc(pageUrl)}">${esc(title)}</a></body></html>`);
};
