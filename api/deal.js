// Public open-deal signing endpoint — the player-facing half of open brand
// deals (deal.html consumes it). The per-player token minted by the admin-side
// 'deal-invite' action is the only credential: it maps to one player on one
// deal. Responses expose ONLY that deal's public face (brand, ask, products,
// expiry) plus the invited player's own name — never roster or internal data.
const crypto = require('crypto');

const SHEET_ID = process.env.SPORTS_SHEET_ID;
const b64url = (s) => Buffer.from(s).toString('base64url');

async function getToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
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
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error(`Sheets error on "${range}": ${data.error.code} ${data.error.message}`);
  return data;
}
async function sheetBatchUpdate(token, data) {
  if (!data.length) return;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets write error: ${d.error.code} ${d.error.message}`);
}
function colLetter(i) { // 0-based index -> A1 letter
  let n = i + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const PAGE_CACHE = {}; // deal.html body, cached per warm instance
const INV_TITLE = 'DealInvites';
const DEALS_TITLE = 'BrandDeals';

const headIdx = (values) => {
  const h = (values[0] || []).map(x => String(x || '').trim().toLowerCase());
  return (n) => h.indexOf(n.toLowerCase());
};
const cell = (row, i) => (i >= 0 ? String(row[i] ?? '').trim() : '');

// The deal is closed once the expires date is fully past (players get the
// whole final day; expiry is a soft "respond by", so plain UTC is fine).
const isExpired = (expires) => !!expires && new Date().toISOString().slice(0, 10) > expires;

// ── Gifted-product link resolution ───────────────────────────────────────────
// The deal's products column holds pasted store links. Shopify stores (most of
// what brands use) expose public JSON — /products/{handle}.js for one product,
// /collections/{handle}/products.json for a whole collection — which gives us
// real photos, names, and prices for the player page. Anything else falls back
// to the page's og: tags. Only links stored in the sheet are ever fetched —
// never URLs from the request — so this can't be steered at other hosts.
const resolveCache = new Map(); // url -> {cards, ts}; survives warm invocations
const RESOLVE_TTL = 10 * 60 * 1000;

// Some stores (Cloudflare bot protection) 403 datacenter IPs outright — retry
// those through the residential proxy, same as the 247 lookups.
let PROXY = null;
if (process.env.PROXY_URL) {
  try { const u = require('undici'); PROXY = { agent: new u.ProxyAgent(process.env.PROXY_URL), fetch: u.fetch }; } catch { /* undici unavailable */ }
}
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const fetchWithTimeout = async (url, ms = 6000, viaProxy = false) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const opts = { signal: ctl.signal, headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en;q=0.9' } };
  try {
    if (viaProxy && PROXY) { opts.dispatcher = PROXY.agent; return await PROXY.fetch(url, opts); }
    return await fetch(url, opts);
  } finally { clearTimeout(t); }
};
const fetchSmart = async (url) => {
  try {
    const r = await fetchWithTimeout(url);
    if (r.ok || !PROXY) return r;
  } catch (e) { if (!PROXY) throw e; }
  return fetchWithTimeout(url, 9000, true);
};
const money = (v) => {
  const n = typeof v === 'number' ? v / 100 : parseFloat(v); // .js gives cents, products.json gives "45.00"
  return isFinite(n) && n > 0 ? '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '') : '';
};
const httpsify = (u) => (typeof u === 'string' && u.startsWith('//') ? 'https:' + u : u || '');
// Shopify CDN serves any width on demand — the originals are 4000px, which is
// silly for a 200px card. Non-Shopify URLs pass through untouched.
const thumb = (u) => (typeof u === 'string' && /cdn\.shopify\.com/.test(u) ? u + (u.includes('?') ? '&' : '?') + 'width=600' : u || '');

async function resolveLink(url) {
  let u;
  try { u = new URL(url); } catch { return [{ title: url, image: '', price: '', url: '' }]; } // plain-text product name
  if (!/^https?:$/.test(u.protocol)) return [];
  try {
    const mProd = u.pathname.match(/\/products\/([A-Za-z0-9_-]+)/);
    const mColl = u.pathname.match(/\/collections\/([A-Za-z0-9_-]+)/);
    if (mProd && !mColl) {
      const r = await fetchSmart(`${u.origin}/products/${mProd[1]}.js`);
      if (r.ok) {
        const p = await r.json();
        return [{ title: p.title || mProd[1], image: thumb(httpsify(p.featured_image || (p.images || [])[0])), price: money(p.price), url: u.origin + (p.url || u.pathname) }];
      }
    } else if (mColl && !mProd) {
      try {
        const r = await fetchSmart(`${u.origin}/collections/${mColl[1]}/products.json?limit=24`);
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j.products) && j.products.length) {
            return j.products.map(p => ({
              title: p.title || p.handle,
              image: thumb(httpsify((p.images || [])[0]?.src)),
              price: money((p.variants || [])[0]?.price),
              url: `${u.origin}/products/${p.handle}`,
            }));
          }
        }
      } catch { /* fall through to the browse card */ }
      // Collection listing unreadable (bot-protected store, or not Shopify) —
      // hand the player the link to browse instead of faking a single product.
      return [{ title: 'Browse the collection', image: '', price: '', url, browse: true }];
    }
    // Fallback: og tags off the page itself.
    const r = await fetchSmart(url);
    if (r.ok) {
      const html = (await r.text()).slice(0, 300000);
      const og = (prop) => {
        const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']+)', 'i'))
          || html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + prop + '["\']', 'i'));
        return m ? m[1] : '';
      };
      return [{ title: og('og:title') || u.hostname, image: httpsify(og('og:image') || og('twitter:image')), price: '', url }];
    }
  } catch { /* fall through */ }
  return [{ title: u.hostname + u.pathname, image: '', price: '', url }];
}

async function resolveProducts(links) {
  const out = [];
  for (const link of links.slice(0, 8)) {
    const hit = resolveCache.get(link);
    if (hit && Date.now() - hit.ts < RESOLVE_TTL) { out.push(...hit.cards); continue; }
    const cards = await resolveLink(link);
    resolveCache.set(link, { cards, ts: Date.now() });
    out.push(...cards);
  }
  return out.slice(0, 40);
}

async function loadByToken(token, tok) {
  const [invD, dealD] = await Promise.all([
    sheetGet(token, `'${INV_TITLE}'!A:L`),
    sheetGet(token, `'${DEALS_TITLE}'!A:AZ`),
  ]);
  const iv = invD.values || [], dv = dealD.values || [];
  const ic = headIdx(iv), dc = headIdx(dv);
  const tI = ic('token');
  let invite = null;
  for (let i = 1; i < iv.length; i++) {
    if (cell(iv[i], tI) === tok) { invite = { rowNum: i + 1, cells: iv[i] }; break; }
  }
  if (!invite) return null;
  const dealId = cell(invite.cells, ic('dealId'));
  let deal = null;
  const dIdI = dc('dealId');
  for (let i = 1; i < dv.length; i++) {
    if (dealId && cell(dv[i], dIdI) === dealId) { deal = { rowNum: i + 1, cells: dv[i] }; break; }
  }
  if (!deal || !/^true$/i.test(cell(deal.cells, dc('open')))) return null;
  return { invite, deal, ic, dc };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tok = String((req.method === 'GET' ? req.query?.token : req.body?.token) || '').trim();

  // /deal/{token} rewrites here with ?page=1: serve the static signing page
  // with a personalized <title> + og tags, so a texted link previews as
  // "Player — Brand Deal Offer from Brand" instead of the generic site title.
  // (Link-preview crawlers don't run JS, so this has to happen server-side.)
  if (req.method === 'GET' && String(req.query?.page || '') === '1') {
    if (!PAGE_CACHE.html) {
      try {
        const r = await fetch(`https://${req.headers.host}/deal.html`);
        if (r.ok) PAGE_CACHE.html = await r.text();
      } catch { /* fall through to redirect */ }
    }
    if (!PAGE_CACHE.html) {
      res.setHeader('location', '/deal.html?t=' + encodeURIComponent(tok));
      return res.status(307).end();
    }
    let title = 'Brand Deal — Milk & Honey Sports';
    if (/^[A-Za-z0-9_-]{8,32}$/.test(tok)) {
      try {
        const token = await getToken();
        const found = await loadByToken(token, tok);
        if (found) {
          const player = cell(found.invite.cells, found.ic('player'));
          const company = cell(found.deal.cells, found.dc('company'));
          if (player && company) title = `${player} — Brand Deal Offer from ${company}`;
        }
      } catch { /* generic title is fine */ }
    }
    const escH = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const t = escH(title);
    const html = PAGE_CACHE.html.replace(/<title>[^<]*<\/title>/,
      `<title>${t}</title>\n  <meta property="og:title" content="${t}" />\n  <meta property="og:description" content="View your offer and sign in one tap." />\n  <meta property="og:image" content="https://${req.headers.host}/share-image-brand-deal.jpg" />\n  <meta name="twitter:card" content="summary_large_image" />`);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.status(200).send(html);
  }

  if (!/^[A-Za-z0-9_-]{8,32}$/.test(tok)) return res.status(404).json({ error: 'Invalid link' });

  try {
    const token = await getToken();
    const found = await loadByToken(token, tok);
    if (!found) return res.status(404).json({ error: 'Invalid link' });
    const { invite, deal, ic, dc } = found;

    const products = cell(deal.cells, dc('products')).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const expires = cell(deal.cells, dc('expires'));
    const dealType = cell(deal.cells, dc('dealType')) || (products.length ? 'product' : 'cash');
    // Cards imported at deal-creation time (copy-paste from bot-protected
    // stores) beat live resolution — they're exactly what the marketer saw.
    let storedCards = [];
    try {
      const rc = JSON.parse(cell(deal.cells, dc('resolvedCards')) || '[]');
      if (Array.isArray(rc)) storedCards = rc.filter(c => c && typeof c.title === 'string' && c.title).slice(0, 60);
    } catch { /* malformed import — fall back to live resolution */ }
    const pickCount = parseInt(cell(deal.cells, dc('pickCount')), 10) || 0;
    const pickBudget = parseInt(cell(deal.cells, dc('pickBudget')), 10) || 0;
    const info = {
      player: cell(invite.cells, ic('player')),
      company: cell(deal.cells, dc('company')),
      value: cell(deal.cells, dc('value')),
      deliverables: cell(deal.cells, dc('deliverables')),
      dealType,
      pickCount,
      pickBudget,
      products,
      expired: isExpired(expires),
      signed: /^signed$/i.test(cell(invite.cells, ic('status'))),
      product: cell(invite.cells, ic('product')),
      signedAt: cell(invite.cells, ic('signedAt')),
    };

    if (req.method === 'GET') {
      // Resolve store links into product cards (photo/name/price) for the
      // picker — only for a live, unsigned product deal.
      if (dealType === 'product' && (products.length || storedCards.length) && !info.signed && !info.expired) {
        info.productCards = storedCards.length ? storedCards : await resolveProducts(products);
      }
      return res.json(info);
    }

    // POST — digital sign-up.
    if (info.expired) return res.status(410).json({ error: 'This deal has closed.' });
    if (info.signed) return res.status(409).json({ error: 'Already signed.' });
    const signature = String(req.body?.signature || '').trim().slice(0, 120);
    const product = String(req.body?.product || '').trim().slice(0, 500);
    if (!signature) return res.status(400).json({ error: 'Type your full name to sign.' });
    if (dealType === 'product' && (products.length || storedCards.length) && !product) return res.status(400).json({ error: 'Pick a product first.' });
    // Multi-pick: titles arrive joined with " + " — cap at the deal's count
    // rule when one is set (budget math stays client-side; prices are dynamic).
    if (pickCount && product.split(' + ').length > pickCount) return res.status(400).json({ error: `You can pick up to ${pickCount}.` });

    const updates = [
      { range: `'${INV_TITLE}'!${colLetter(ic('status'))}${invite.rowNum}`, values: [['signed']] },
      { range: `'${INV_TITLE}'!${colLetter(ic('product'))}${invite.rowNum}`, values: [[product]] },
      { range: `'${INV_TITLE}'!${colLetter(ic('signature'))}${invite.rowNum}`, values: [[signature]] },
      { range: `'${INV_TITLE}'!${colLetter(ic('signedAt'))}${invite.rowNum}`, values: [[new Date().toISOString()]] },
    ];
    // Record the chosen products' store links (server-resolved, so the client
    // can't forge them) — the brand export ships from these.
    const uI = ic('productUrls');
    if (uI >= 0 && dealType === 'product' && (products.length || storedCards.length)) {
      try {
        const cards = storedCards.length ? storedCards : await resolveProducts(products);
        const urls = product.split(' + ').map(t => (cards.find(c => c.title === t) || {}).url || '').filter(Boolean);
        if (urls.length) updates.push({ range: `'${INV_TITLE}'!${colLetter(uI)}${invite.rowNum}`, values: [[urls.join('\n')]] });
      } catch { /* links are a nice-to-have; the sign still lands */ }
    }
    // Signing also tags the player on the deal row itself, so the deal shows
    // up on their profile's Brand Deals card like any other deal.
    const clI = dc('clients');
    if (clI >= 0) {
      const names = cell(deal.cells, clI).split(',').map(s => s.trim()).filter(Boolean);
      if (!names.some(n => n.toLowerCase() === info.player.toLowerCase())) {
        updates.push({ range: `'${DEALS_TITLE}'!${colLetter(clI)}${deal.rowNum}`, values: [[[...names, info.player].join(', ')]] });
      }
    }
    await sheetBatchUpdate(token, updates);
    return res.json({ success: true });
  } catch (err) {
    console.error('Deal endpoint error:', err.message);
    return res.status(500).json({ error: 'Something went wrong — try again.' });
  }
};
