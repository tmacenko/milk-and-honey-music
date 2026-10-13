// Marketing-plan decks ("presentations") — owner-built slide decks attached to
// a recruiting-board player, shared at /plan/{id}.
//
//   GET  /plan/:id          → the public page (deck content only; nothing
//                             internal ever lands in a row, so nothing can leak)
//   GET  /plan-preview      → the same page shell with no data; the in-app
//                             editor posts drafts into it for a live preview
//   POST /api/plan          → owner-only writes: save / status / delete / upload
//
// Storage: the `Presentations` tab of the sports sheet (one row per deck, the
// slides as JSON in `deck`) and public Blob for photos/logos under plans/.
const crypto = require('crypto');
const { authState } = require('../lib/auth');

const SHEET_ID = process.env.SPORTS_SHEET_ID;
const BLOB_API = 'https://blob.vercel-storage.com';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const APP_URL = 'https://www.milkandhoneyfamily.com';
const OWNERS = String(process.env.USAGE_OWNERS || 'tyler@milkhoneyla.com').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const TAB = 'Presentations';
const COLS = ['id', 'playerId', 'player', 'title', 'status', 'expires', 'views', 'deck', 'createdBy', 'createdAt', 'updatedAt'];
const TYPEKIT = 'https://use.typekit.net/sgl3fhj.css';

const b64url = (s) => Buffer.from(s).toString('base64url');
async function getToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
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
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error(`Sheets error on "${range}": ${data.error.code} ${data.error.message}`);
  return data;
}
async function sheetAppend(token, range, values) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets append error: ${d.error.code} ${d.error.message}`);
}
async function sheetBatchUpdate(token, data) {
  if (!data.length) return;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets write error: ${d.error.code} ${d.error.message}`);
}
async function batchRequests(token, requests) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets batch error: ${d.error.code} ${d.error.message}`);
  return d;
}
function colLetter(i) { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

// Read the tab as {headers, rows:[{_row, cells}]}; create it with the standard
// headers on first use (same guard as athletes.js: only after a genuine create).
async function readTab(token) {
  let values;
  try { values = (await sheetGet(token, `'${TAB}'!A:Z`)).values || []; }
  catch (e) {
    const created = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB, gridProperties: { rowCount: 1000, columnCount: COLS.length } } } }] }),
    }).then(r => r.json());
    if (created.error) throw e;
    await sheetAppend(token, `'${TAB}'!A:Z`, [COLS]);
    values = [COLS];
  }
  const headers = (values[0] || []).map(h => String(h || '').trim());
  const rows = values.slice(1).map((r, i) => ({ _row: i + 2, cells: headers.map((_, j) => String(r[j] ?? '')) })).filter(r => r.cells.some(c => c));
  return { headers, rows };
}
const idx = (headers, name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
const rowObj = (headers, r) => { const o = { _row: r._row }; headers.forEach((h, j) => { o[h] = r.cells[j] ?? ''; }); return o; };

// ── Deck sanitising ──────────────────────────────────────────────────────────
// Only known slide types and fields survive; everything is a capped string.
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const url = (v) => { const s = str(v, 500).trim(); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ''; };
const pos = (v) => (/^\d{1,3}% \d{1,3}%$/.test(String(v || '')) ? v : '50% 50%');
const ICONS = ['handshake', 'megaphone', 'community', 'camera', 'trophy', 'star', 'chart', 'mic', 'heart', 'globe', 'calendar', 'dollar', 'shirt', 'phone'];
function cleanSlide(s) {
  if (!s || typeof s !== 'object') return null;
  const base = { type: s.type, photo: url(s.photo), photoPos: pos(s.photoPos) };
  if (s.type === 'cover') return { ...base, name: str(s.name, 60), subtitle: str(s.subtitle, 80), showLogo: s.showLogo !== false };
  if (s.type === 'focus') return { ...base, title: str(s.title, 60), items: (Array.isArray(s.items) ? s.items : []).slice(0, 4).map(it => ({ icon: ICONS.includes(it?.icon) ? it.icon : 'star', image: url(it?.image), label: str(it?.label, 40) })) };
  if (s.type === 'section') return {
    ...base, title: str(s.title, 60),
    groups: (Array.isArray(s.groups) ? s.groups : []).slice(0, 4).map(g => ({ heading: str(g?.heading, 60), bullets: (Array.isArray(g?.bullets) ? g.bullets : []).slice(0, 8).map(b => str(b, 240)).filter(Boolean) })),
    logos: (Array.isArray(s.logos) ? s.logos : []).slice(0, 6).map(l => ({ url: url(l?.url), name: str(l?.name, 40) })).filter(l => l.url),
  };
  return null;
}
function cleanDeck(d) {
  const slides = (Array.isArray(d?.slides) ? d.slides : []).map(cleanSlide).filter(Boolean).slice(0, 20);
  return { v: 1, slides };
}

// ── Page ─────────────────────────────────────────────────────────────────────
const escH = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function pageHtml({ title, description, image, deck, preview, gone }) {
  const data = preview ? null : { title, deck: deck || null, gone: !!gone };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${escH(title)}</title>
<link rel="icon" type="image/png" href="/favicon.png" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#000000" />
<meta property="og:title" content="${escH(title)}" />
<meta property="og:description" content="${escH(description)}" />
<meta property="og:image" content="${escH(image)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Milk &amp; Honey Sports" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="stylesheet" href="${TYPEKIT}" />
<link rel="stylesheet" href="/plan.css?v=3" />
</head>
<body>
<div id="deck"></div>
<script>window.__PLAN__=${preview ? 'null' : JSON.stringify(data).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029")};window.__PREVIEW__=${preview ? 'true' : 'false'};</script>
<script src="/plan.js?v=3"></script>
</body>
</html>`;
}
const isExpired = (expires) => !!expires && new Date().toISOString().slice(0, 10) > String(expires).slice(0, 10);
const BOTS = ['facebookexternalhit', 'twitterbot', 'linkedinbot', 'slackbot', 'whatsapp', 'telegrambot', 'discordbot', 'applebot', 'googlebot', 'bingbot', 'preview', 'unfurl', 'embed', 'crawler', 'spider', 'bot/', 'curl', 'wget', 'python-requests', 'axios'];
const isCrawler = (ua) => { const l = String(ua || '').toLowerCase(); return BOTS.some(b => l.includes(b)); };

module.exports = async (req, res) => {
  if (!SHEET_ID) return res.status(500).json({ error: 'Not configured' });

  if (req.method === 'GET') {
    const q = req.query || {};
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (String(q.preview || '') === '1') {
      res.setHeader('Cache-Control', 'no-store');
      return res.send(pageHtml({ title: 'Preview', description: '', image: `${APP_URL}/share-image.jpg`, preview: true }));
    }
    const id = String(q.id || '').trim();
    const gone = (code) => res.status(code).send(pageHtml({ title: 'Milk & Honey Sports', description: '', image: `${APP_URL}/share-image.jpg`, gone: true }));
    if (!/^[a-f0-9]{10,16}$/.test(id)) return gone(404);
    try {
      const token = await getToken();
      const { headers, rows } = await readTab(token);
      const r = rows.find(x => x.cells[idx(headers, 'id')] === id);
      if (!r) return gone(404);
      const o = rowObj(headers, r);
      if (o.status !== 'live' || isExpired(o.expires)) return gone(410);
      let deck; try { deck = cleanDeck(JSON.parse(o.deck || '{}')); } catch { deck = { v: 1, slides: [] }; }
      const cover = deck.slides.find(s => s.type === 'cover');
      const title = [o.player, o.title].filter(Boolean).join(' — ') || 'Milk & Honey Sports';
      // Count real visits only: not link-preview crawlers, not signed-in staff.
      if (!isCrawler(req.headers['user-agent']) && !authState(req).admin) {
        const vi = idx(headers, 'views');
        const n = parseInt(o.views, 10) || 0;
        if (vi >= 0) sheetBatchUpdate(token, [{ range: `'${TAB}'!${colLetter(vi)}${r._row}`, values: [[String(n + 1)]] }]).catch(() => {});
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.send(pageHtml({ title, description: 'Milk & Honey Sports', image: (cover && cover.photo) || `${APP_URL}/share-image.jpg`, deck }));
    } catch (err) {
      console.error('Plan page error:', err.message);
      return res.status(500).send('Could not load this plan.');
    }
  }

  if (req.method === 'POST') {
    const st = authState(req);
    if (!st.user || !OWNERS.includes(String(st.user.email || '').toLowerCase())) return res.status(403).json({ error: 'Not authorized' });
    const b = req.body || {};
    try {
      if (b.action === 'upload') {
        if (!BLOB_TOKEN) return res.status(500).json({ error: 'Photo storage not configured' });
        const m = String(b.data || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/);
        if (!m) return res.status(400).json({ error: 'Expected a JPEG, PNG, or WebP image' });
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'Image too large (max 4MB)' });
        const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
        const slug = String(b.name || 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
        const path = `plans/${slug}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const up = await fetch(`${BLOB_API}/${path}`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7', 'content-type': m[1], 'x-add-random-suffix': '0', 'x-cache-control-max-age': '31536000' },
          body: buf,
        });
        const ud = await up.json().catch(() => ({}));
        if (!up.ok || !ud.url) return res.status(502).json({ error: 'Upload failed' });
        return res.json({ url: ud.url });
      }

      const token = await getToken();
      const { headers, rows } = await readTab(token);
      const col = (name) => idx(headers, name);
      const cellRange = (name, row) => `'${TAB}'!${colLetter(col(name))}${row}`;
      const now = new Date().toISOString();

      if (b.action === 'save') {
        const deck = cleanDeck(b.deck);
        if (!deck.slides.length) return res.status(400).json({ error: 'Add at least one slide' });
        const title = str(b.title, 80).trim() || 'Marketing plan';
        const expires = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expires || '')) ? b.expires : '';
        const playerId = str(b.playerId, 40).trim();
        const player = str(b.player, 80).trim();
        const json = JSON.stringify(deck);
        if (json.length > 45000) return res.status(413).json({ error: 'This deck is too large to save' });
        let id = String(b.id || '').trim();
        const existing = id && rows.find(x => x.cells[col('id')] === id);
        if (existing) {
          await sheetBatchUpdate(token, [
            { range: cellRange('title', existing._row), values: [[title]] },
            { range: cellRange('expires', existing._row), values: [[expires]] },
            { range: cellRange('deck', existing._row), values: [[json]] },
            { range: cellRange('updatedAt', existing._row), values: [[now]] },
          ]);
        } else {
          id = crypto.randomBytes(6).toString('hex');
          const vals = { id, playerId, player, title, status: 'live', expires, views: '0', deck: json, createdBy: st.user.name || st.user.email, createdAt: now, updatedAt: now };
          await sheetAppend(token, `'${TAB}'!A:Z`, [headers.map(h => vals[h] ?? '')]);
        }
        return res.json({ id, url: `${APP_URL}/plan/${id}` });
      }
      if (b.action === 'status') {
        const r = rows.find(x => x.cells[col('id')] === String(b.id || ''));
        if (!r) return res.status(404).json({ error: 'Plan not found' });
        const status = b.status === 'revoked' ? 'revoked' : 'live';
        await sheetBatchUpdate(token, [{ range: cellRange('status', r._row), values: [[status]] }, { range: cellRange('updatedAt', r._row), values: [[now]] }]);
        return res.json({ ok: true, status });
      }
      if (b.action === 'delete') {
        const r = rows.find(x => x.cells[col('id')] === String(b.id || ''));
        if (!r) return res.status(404).json({ error: 'Plan not found' });
        const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } })).json();
        const sheet = (meta.sheets || []).find(s => (s.properties?.title || '').trim().toLowerCase() === TAB.toLowerCase());
        if (!sheet) throw new Error('Tab not found');
        await batchRequests(token, [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: r._row - 1, endIndex: r._row } } }]);
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
      console.error('Plan write error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
};
module.exports.pageHtml = pageHtml;
module.exports.cleanDeck = cleanDeck;
