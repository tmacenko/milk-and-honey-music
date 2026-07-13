// api/athletes.js — Sports roster (football clients), read-only for the unified
// site. Merges the NFL / College / Highschool tabs with the AppData enrichment
// tab (keyed by name), same as the Sports app. Prospects are intentionally
// ignored. Auth-aware: anonymous visitors get only Public athletes and only the
// public-safe fields; admins get everything.
const crypto = require('crypto');
const { authState } = require('../lib/auth');

const SHEET_ID = process.env.SPORTS_SHEET_ID;

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
  if (!data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function sheetGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error(`Sheets API error on "${range}": ${data.error.code} ${data.error.message}`);
  return data;
}

function parseRows(data) {
  const rows = data?.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1).map((row, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, j) => { obj[h] = String(row[j] ?? '').trim(); });
    return obj;
  }).filter(r => (r['Name'] || r['name'] || '').trim());
}

const handle = h => String(h || '').replace(/^@/, '').trim();
const slugOf = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function deriveStatus(team) {
  if (!team || !team.trim()) return 'Free Agent';
  const t = team.toLowerCase().trim();
  if (t.includes('free agent')) return 'Free Agent';
  if (t === 'rookie') return 'Rookie';
  if (t === 'inactive' || t === 'retired') return t.charAt(0).toUpperCase() + t.slice(1);
  return 'Active';
}
function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) { const k = n / 1e3; return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K'; }
  return Math.round(n).toString();
}
function fmtFollowers(raw) {
  if (!raw || raw === '—' || raw === '') return raw;
  const s = String(raw).trim();
  if (/^[\d.]+\s*[KkMmBb]$/.test(s)) {
    const n = parseFloat(s), suffix = s.slice(-1).toUpperCase();
    return formatNum(suffix === 'M' ? n * 1e6 : suffix === 'B' ? n * 1e9 : n * 1e3);
  }
  const num = parseFloat(s.replace(/,/g, ''));
  return isNaN(num) ? s : formatNum(num);
}
const isPublicFlag = ext => {
  const key = Object.keys(ext).find(k => k.toLowerCase() === 'public');
  return key ? ['true', 'yes', '1', 'x', 'y', '✓'].includes(String(ext[key]).trim().toLowerCase()) : false;
};

function mergeAthlete(row, ext, level) {
  const isNFL = level === 'NFL';
  const team = isNFL ? (row['Team'] || '') : (row['School'] || '');
  const status = ext['status'] ? ext['status'] : (isNFL ? deriveStatus(team) : 'Active');
  const tabTiktok = handle(row['TikTok'] || row['Tiktok'] || '');
  return {
    _rowIndex: row._rowIndex,
    id: slugOf(row['Name']),
    slug: slugOf(row['Name']),
    name: (row['Name'] || '').trim(),
    level,
    public: isPublicFlag(ext),
    position: row['Position'] || '',
    nflTeam: isNFL ? team : '',
    college: isNFL ? (ext['college'] || '') : team,
    status,
    instagram: handle(row['Instagram']),
    twitter: handle(row['Twitter']),
    tiktok: tabTiktok || handle(ext['tiktok'] || ''),
    igFollowers: fmtFollowers(ext['igFollowers']),
    twitterFollowers: fmtFollowers(ext['twitterFollowers']),
    tiktokFollowers: fmtFollowers(ext['tiktokFollowers']),
    igEngagement: ext['igEngagement'] || '',
    bio: ext['bio'] || '',
    hometown: ext['hometown'] || '',
    height: ext['height'] || '',
    weight: ext['weight'] || '',
    jerseyNumber: ext['jerseyNumber'] || '',
    classOf: level === 'High School' ? (row['ClassOf'] || row['Class Of'] || '') : '',
    committedTo: (level === 'High School' ? (row['Committed'] || row['Commitment'] || '') : '') || ext['committedTo'] || '',
    yearInSchool: ext['yearInSchool'] || '',
    draftYear: ext['draftYear'] || '',
    draftRound: ext['draftRound'] || '',
    draftPick: ext['draftPick'] || '',
    espnId: ext['espnId'] || '',
    espnSport: ext['espnSport'] || (isNFL ? 'nfl' : 'college'),
    teamLogo: ext['teamLogo'] || '',
    photoUrl: ext['photoUrl'] || '',
    heroImageUrl: ext['heroImageUrl'] || '',
    profileUrl247: ext['profileUrl247'] || '',
    // ── internal-only (stripped for anonymous visitors) ──
    agentAssigned: row['Lead Agent'] || row['Agent'] || '',
    birthday: row['Birthday'] || '',
    shirtSize: row['Shirt'] || '', hoodieSize: row['Hoodie'] || '', shortsSize: row['Shorts'] || '',
    sweatpantsSize: row['Pants'] || '', shoeSize: row['Shoes'] || '', glovesSize: row['Gloves'] || '',
    gamingSystem: row['Gaming System'] || '',
    nilContract: row['Contract (2026)'] || '',
    address: (row['Address'] || '') || ext['address'] || '',
    email: ext['email'] || '', phone: ext['phone'] || '',
    notes: ext['notes'] || '',
    interests: ext['interests'] ? ext['interests'].split(',').map(s => s.trim()).filter(Boolean) : [],
    brands: ext['brands'] ? ext['brands'].split(',').map(s => s.trim()).filter(Boolean) : [],
    musicArtists: ext['musicArtists'] ? ext['musicArtists'].split(',').map(s => s.trim()).filter(Boolean) : [],
    brandTargets: ext['brandTargets'] ? ext['brandTargets'].split(',').map(s => s.trim()).filter(Boolean) : [],
    onboardedAt: ext['onboardedAt'] || '',
  };
}

// Fields kept for anonymous visitors. Everything else (rep, address, phone,
// email, birthday, sizes, gaming, NIL, interests, brands, music, targets,
// notes, onboarded) is stripped server-side.
const PUBLIC_FIELDS = new Set([
  '_rowIndex', 'id', 'slug', 'name', 'level', 'public', 'position', 'nflTeam', 'college', 'status',
  'instagram', 'twitter', 'tiktok', 'igFollowers', 'twitterFollowers', 'tiktokFollowers', 'igEngagement',
  'bio', 'hometown', 'height', 'weight', 'jerseyNumber', 'classOf', 'committedTo', 'yearInSchool',
  'draftYear', 'draftRound', 'draftPick', 'espnId', 'espnSport', 'teamLogo', 'photoUrl', 'heroImageUrl', 'profileUrl247',
]);
const pickPublic = a => {
  const o = {};
  for (const k of Object.keys(a)) if (PUBLIC_FIELDS.has(k)) o[k] = a[k];
  return o;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!SHEET_ID) return res.json({ athletes: [], isAdmin: false, authConfigured: false, notConfigured: true });

  try {
    const token = await getToken();
    const [nfl, col, hs, app] = await Promise.all([
      sheetGet(token, 'NFL!A:P'),
      sheetGet(token, 'College!A:Q'),
      sheetGet(token, 'Highschool!A:S'),
      sheetGet(token, 'AppData!A:AZ'),
    ]);

    const appMap = {};
    parseRows(app).forEach(r => { const k = (r['name'] || r['Name'] || '').toLowerCase().trim(); if (k) appMap[k] = r; });
    const lookup = name => appMap[(name || '').toLowerCase().trim()] || {};

    let athletes = [
      ...parseRows(nfl).map(r => mergeAthlete(r, lookup(r['Name']), 'NFL')),
      ...parseRows(col).map(r => mergeAthlete(r, lookup(r['Name']), 'College')),
      ...parseRows(hs).map(r => mergeAthlete(r, lookup(r['Name']), 'High School')),
    ].filter(a => a.name);

    const appHeaders = (app?.values?.[0] || []).map(h => String(h || '').trim());
    const publicColumnExists = appHeaders.some(h => h.toLowerCase() === 'public');

    const { configured, admin } = authState(req);
    if (configured && !admin) {
      athletes = (publicColumnExists ? athletes.filter(a => a.public) : athletes).map(pickPublic);
    }

    return res.json({ athletes, isAdmin: !configured || admin, authConfigured: configured, publicColumnExists });
  } catch (err) {
    console.error('Athletes error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
