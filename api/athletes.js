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

// ── ESPN image derivation (headshot + team logo) ──────────────────────────────
const NFL_LOGOS = {
  "arizona cardinals": "ari", "atlanta falcons": "atl", "baltimore ravens": "bal",
  "buffalo bills": "buf", "carolina panthers": "car", "chicago bears": "chi",
  "cincinnati bengals": "cin", "cleveland browns": "cle", "dallas cowboys": "dal",
  "denver broncos": "den", "detroit lions": "det", "green bay packers": "gb",
  "houston texans": "hou", "indianapolis colts": "ind", "jacksonville jaguars": "jax",
  "kansas city chiefs": "kc", "las vegas raiders": "lv", "los angeles chargers": "lac",
  "los angeles rams": "lar", "miami dolphins": "mia", "minnesota vikings": "min",
  "new england patriots": "ne", "new orleans saints": "no", "new york giants": "nyg",
  "new york jets": "nyj", "philadelphia eagles": "phi", "pittsburgh steelers": "pit",
  "san francisco 49ers": "sf", "seattle seahawks": "sea", "tampa bay buccaneers": "tb",
  "tennessee titans": "ten", "washington commanders": "wsh",
};
const COLLEGE_LOGOS = {
  "michigan": 130, "ohio state": 194, "penn state": 213, "michigan state": 127,
  "iowa": 2294, "wisconsin": 275, "minnesota": 135, "illinois": 356, "indiana": 84,
  "purdue": 2509, "northwestern": 77, "nebraska": 158, "maryland": 166, "rutgers": 164,
  "usc": 30, "ucla": 26, "oregon": 2483, "washington": 264, "stanford": 24,
  "california": 25, "oregon state": 204, "washington state": 265,
  "alabama": 333, "georgia": 61, "lsu": 99, "florida": 57, "tennessee": 2633,
  "texas a&m": 245, "auburn": 2, "arkansas": 8, "mississippi state": 344,
  "ole miss": 145, "south carolina": 2579, "vanderbilt": 238, "missouri": 142,
  "kentucky": 96, "texas": 251, "oklahoma": 201,
  "clemson": 228, "florida state": 52, "miami": 2390, "north carolina": 153,
  "nc state": 152, "virginia": 258, "virginia tech": 259, "pittsburgh": 221,
  "pitt": 221, "boston college": 103, "duke": 150, "wake forest": 154, "wake forrest": 154,
  "georgia tech": 59, "louisville": 97, "syracuse": 183,
  "kansas": 2305, "kansas state": 2306, "iowa state": 66, "baylor": 239,
  "tcu": 2628, "texas tech": 2641, "oklahoma state": 197, "west virginia": 277,
  "colorado": 38, "arizona": 12, "arizona state": 9, "utah": 254,
  "cincinnati": 2132, "ucf": 2116, "houston": 248, "byu": 252,
  "memphis": 235, "smu": 2567, "tulane": 2655, "temple": 119,
  "app state": 2026, "appalachian state": 2026,
  "western michigan": 2711, "western kentucky": 98, "toledo": 2649, "kent state": 2309, "kennesaw state": 338, "kennesaw": 338,
  "san diego state": 21, "unlv": 2439, "fresno state": 278,
  "ohio": 195, "northern illinois": 2459, "miami (oh)": 193,
  "notre dame": 87, "army": 349, "navy": 2426, "liberty": 2335, "james madison": 256, "jmu": 256,
  "uconn": 41, "connecticut": 41, "holy cross": 107, "montana state": 147, "montana": 149,
};
function collegeKeyMatch(college, key) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp('(?:^|\\s)' + esc(key) + '(?:\\s|$)').test(college)) return true;
  if (new RegExp('(?:^|\\s)' + esc(college) + '(?:\\s|$)').test(key)) return true;
  return false;
}
function espnHeadshot(espnId, espnSport) {
  if (!espnId) return '';
  const sport = (espnSport || 'nfl') === 'college' ? 'college-football' : 'nfl';
  // ESPN's resizing combiner -> ~30KB instead of ~300KB full-size headshots.
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/${sport}/players/full/${espnId}.png&w=200`;
}
function teamLogoFor(level, nflTeam, college, override) {
  const team = (nflTeam || '').toLowerCase().trim();
  const col = (college || '').toLowerCase().trim();
  if (team && NFL_LOGOS[team]) return `https://a.espncdn.com/i/teamlogos/nfl/500/${NFL_LOGOS[team]}.png`;
  if (level === 'NFL') return override || '';
  if (level === 'College' && col) {
    if (COLLEGE_LOGOS[col]) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${COLLEGE_LOGOS[col]}.png`;
    const key = Object.keys(COLLEGE_LOGOS).find(k => collegeKeyMatch(col, k));
    if (key) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${COLLEGE_LOGOS[key]}.png`;
  }
  return override || '';
}

function mergeAthlete(row, ext, level) {
  const isNFL = level === 'NFL';
  const team = isNFL ? (row['Team'] || '') : (row['School'] || '');
  const status = ext['status'] ? ext['status'] : (isNFL ? deriveStatus(team) : 'Active');
  const tabTiktok = handle(row['TikTok'] || row['Tiktok'] || '');
  const nflTeam = isNFL ? team : '';
  const college = isNFL ? (ext['college'] || '') : team;
  // ESPN-derived images (manual sheet values win): all NFL/College players have them.
  const photoUrl = ext['photoUrl'] || espnHeadshot(ext['espnId'], ext['espnSport'] || (isNFL ? 'nfl' : 'college'));
  const teamLogo = teamLogoFor(level, nflTeam, college, ext['teamLogo']);
  return {
    _rowIndex: row._rowIndex,
    id: slugOf(row['Name']),
    slug: slugOf(row['Name']),
    name: (row['Name'] || '').trim(),
    level,
    public: isPublicFlag(ext),
    position: row['Position'] || '',
    nflTeam,
    college,
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
    teamLogo,
    photoUrl,
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
