const crypto = require('crypto');

const SHEET_ID = process.env.MUSIC_SHEET_ID;

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
// D  City
// E  State
// F  Country
// G  PRO                 (BMI, ASCAP, SESAC, etc.)
// H  Publisher
// I  Record Label
// J  Artists Worked With (comma-separated)
// K  Bio
// L  Photo URL
// M  Instagram
// N  Twitter
// O  TikTok
// P  Spotify Monthly Listeners
// Q  Spotify URL
// R  Apple Music URL
// S  SoundCloud URL
// T  Notes               (internal only)
// U  Onboarded At
// V  Spotify Artist ID

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
    city:         g('City'),
    state:        g('State'),
    country:      g('Country'),
    pro:          g('PRO'),
    publisher:    g('Publisher'),
    label:        g('Record Label'),
    credits:      g('Artists Worked With') ? g('Artists Worked With').split(',').map(s => s.trim()).filter(Boolean) : [],
    bio:          g('Bio'),
    photoUrl:     g('Photo URL'),
    instagram:    g('Instagram').replace(/^@/, ''),
    twitter:      g('Twitter').replace(/^@/, ''),
    tiktok:       g('TikTok').replace(/^@/, ''),
    spotifyMonthly: g('Spotify Monthly Listeners'),
    spotifyUrl:   g('Spotify URL'),
    appleMusicUrl: g('Apple Music URL'),
    soundcloudUrl: g('SoundCloud URL'),
    notes:        g('Notes'),
    onboardedAt:  g('Onboarded At'),
    spotifyId:    g('Spotify Artist ID'),
  };
}

function clientRow(c) {
  const handle = h => h ? (h.startsWith('@') ? h : '@' + h) : '';
  return [
    c.name             || '',  // A
    (c.types || []).join(', ') || c.type || '', // B
    c.contact          || '',  // C
    c.city             || '',  // D
    c.state            || '',  // E
    c.country          || '',  // F
    c.pro              || '',  // G
    c.publisher        || '',  // H
    c.label            || '',  // I
    (c.credits || []).join(', '), // J
    c.bio              || '',  // K
    c.photoUrl         || '',  // L
    handle(c.instagram),       // M
    handle(c.twitter),         // N
    handle(c.tiktok),          // O
    c.spotifyMonthly   || '',  // P
    c.spotifyUrl       || '',  // Q
    c.appleMusicUrl    || '',  // R
    c.soundcloudUrl    || '',  // S
    c.notes            || '',  // T
    c.onboardedAt      || '',  // U
    c.spotifyId        || '',  // V
  ];
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getToken();

    // ── GET: load clients ────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const data = await sheetGet(token, 'Clients!A:V');
      const rows = data?.values || [];
      if (rows.length < 2) return res.json({ clients: [] });
      const headers = rows[0].map(h => String(h || '').trim());
      const clients = rows.slice(1).map((row, i) => {
        const obj = { _rowIndex: i + 2 };
        headers.forEach((h, j) => { obj[h] = String(row[j] ?? '').trim(); });
        return parseClient(obj, i);
      }).filter(Boolean);
      return res.json({ clients });
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

      // Save / create client
      const { action, client: c } = req.body;
      if (!c?.name) return res.status(400).json({ error: 'Missing client name' });
      const row = clientRow(c);

      if (action === 'create') {
        await sheetAppend(token, 'Clients!A:V', [row]);
      } else {
        if (!c._rowIndex) return res.status(400).json({ error: 'Missing row index' });
        await sheetUpdate(token, `Clients!A${c._rowIndex}:V${c._rowIndex}`, [row]);
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Music sheets error:', err);
    return res.status(500).json({ error: err.message });
  }
};
