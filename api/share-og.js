// api/share-og.js
// Routes /share/:id and /roster/:id requests.
// Crawlers (iMessage, Slack, etc.) → served OG-tagged HTML with share data
// Real browsers → simple HTML that loads share.html / roster-share.html JS app

const BLOB_API = 'https://blob.vercel-storage.com';
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://milk-and-honey-music.vercel.app').replace(/\/$/, '');
// TODO: replace with a Music-specific share image once designed; reusing Sports' for now.
const OG_IMAGE = 'https://milkhoneysports.app/share-image.jpg';

const BOT_AGENTS = [
  'facebookexternalhit','twitterbot','linkedinbot','slackbot','whatsapp',
  'telegrambot','discordbot','applebot','googlebot','bingbot','yandex',
  'msnbot','preview','unfurl','embed','crawler','spider','bot/','curl',
  'wget','python-requests','axios',
];

function isCrawler(ua) {
  if (!ua) return false;
  const low = ua.toLowerCase();
  return BOT_AGENTS.some(b => low.includes(b));
}

async function fetchShareData(id) {
  try {
    const params = new URLSearchParams({ prefix: `share-${id}`, limit: '1' });
    const r = await fetch(`${BLOB_API}?${params}`, {
      headers: { authorization: `Bearer ${TOKEN}`, 'x-api-version': '7' },
    });
    if (!r.ok) return null;
    const list = await r.json();
    const blob = list.blobs?.[0];
    if (!blob) return null;
    const data = await fetch(blob.url);
    if (!data.ok) return null;
    return data.json();
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing share ID');

  const isRoster = req.query.kind === 'roster';
  const routeBase = isRoster ? 'roster' : 'share';
  const targetFile = isRoster ? 'roster-share.html' : 'share.html';

  const ua = req.headers['user-agent'] || '';
  const pageUrl = `${APP_URL}/${routeBase}/${id}`;
  const shareHtmlUrl = `${APP_URL}/${targetFile}?id=${id}`;

  // ── Real browser: return a minimal HTML shell that loads the JS app ────────
  if (!isCrawler(ua)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0;url=${shareHtmlUrl}" />
  <title>Milk &amp; Honey Music</title>
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
</head>
<body style="background:#080809;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <script>window.location.replace("${shareHtmlUrl}")</script>
  <p style="color:#555;font-family:sans-serif;">Loading…</p>
</body>
</html>`);
  }

  // ── Crawler: fetch share data and return full OG tags ─────────────────────
  let title = 'Milk & Honey Music — Client Roster';
  let description = 'Client roster shared by Milk & Honey Music';

  try {
    const data = await fetchShareData(id);
    if (data) {
      if (data.type === 'individual' && data.client?.name) {
        title = `${data.client.name} — Milk & Honey Music`;
        description = 'Milk & Honey Music';
      } else if (data.title) {
        title = data.title;
        const n = data.athletes?.length || data.clients?.length;
        if (n) description = `${n} client${n !== 1 ? 's' : ''} · Milk & Honey Music`;
      }
    }
  } catch { /* use defaults */ }

  const abs = (path) => path.startsWith('http') ? path : `${APP_URL}${path}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${abs(OG_IMAGE)}" />
  <meta property="og:image:width" content="1822" />
  <meta property="og:image:height" content="921" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Milk &amp; Honey Music" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${abs(OG_IMAGE)}" />
  <meta http-equiv="refresh" content="0;url=${pageUrl}" />
</head>
<body>
  <a href="${pageUrl}">${title}</a>
</body>
</html>`);
};
