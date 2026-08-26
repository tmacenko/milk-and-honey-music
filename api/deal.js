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

async function loadByToken(token, tok) {
  const [invD, dealD] = await Promise.all([
    sheetGet(token, `'${INV_TITLE}'!A:I`),
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
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(tok)) return res.status(404).json({ error: 'Invalid link' });

  try {
    const token = await getToken();
    const found = await loadByToken(token, tok);
    if (!found) return res.status(404).json({ error: 'Invalid link' });
    const { invite, deal, ic, dc } = found;

    const products = cell(deal.cells, dc('products')).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const expires = cell(deal.cells, dc('expires'));
    const info = {
      player: cell(invite.cells, ic('player')),
      company: cell(deal.cells, dc('company')),
      value: cell(deal.cells, dc('value')),
      deliverables: cell(deal.cells, dc('deliverables')),
      products,
      expires,
      expired: isExpired(expires),
      signed: /^signed$/i.test(cell(invite.cells, ic('status'))),
      product: cell(invite.cells, ic('product')),
      signedAt: cell(invite.cells, ic('signedAt')),
    };

    if (req.method === 'GET') return res.json(info);

    // POST — digital sign-up.
    if (info.expired) return res.status(410).json({ error: 'This deal has closed.' });
    if (info.signed) return res.status(409).json({ error: 'Already signed.' });
    const signature = String(req.body?.signature || '').trim().slice(0, 120);
    const product = String(req.body?.product || '').trim().slice(0, 200);
    if (!signature) return res.status(400).json({ error: 'Type your full name to sign.' });
    if (products.length && !products.includes(product)) return res.status(400).json({ error: 'Pick a product first.' });

    const updates = [
      { range: `'${INV_TITLE}'!${colLetter(ic('status'))}${invite.rowNum}`, values: [['signed']] },
      { range: `'${INV_TITLE}'!${colLetter(ic('product'))}${invite.rowNum}`, values: [[product]] },
      { range: `'${INV_TITLE}'!${colLetter(ic('signature'))}${invite.rowNum}`, values: [[signature]] },
      { range: `'${INV_TITLE}'!${colLetter(ic('signedAt'))}${invite.rowNum}`, values: [[new Date().toISOString()]] },
    ];
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
