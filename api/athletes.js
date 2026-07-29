// api/athletes.js — Sports roster (football clients), read-only for the unified
// site. Merges the NFL / College / Highschool tabs with the AppData enrichment
// tab (keyed by name), same as the Sports app. Prospects are intentionally
// ignored. Auth-aware: anonymous visitors get only Public athletes and only the
// public-safe fields; admins get everything.
const crypto = require('crypto');
const { authState } = require('../lib/auth');

const SHEET_ID = process.env.SPORTS_SHEET_ID;

function b64url(str) { return Buffer.from(str).toString('base64url'); }

async function getToken(scope = 'https://www.googleapis.com/auth/spreadsheets.readonly') {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key.client_email, scope,
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

// Column index (0-based) → A1 letter, e.g. 0→A, 27→AB.
function colLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
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
async function sheetAppend2(token, range, rows) {
  if (!rows.length) return;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets append error: ${d.error.code} ${d.error.message}`);
}
async function sheetAppend(token, range, row) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets append error: ${d.error.code} ${d.error.message}`);
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
  const sheetTeam = isNFL ? (row['Team'] || '') : (row['School'] || '');
  // Effective team: manual override (trade/transfer grace period) beats the
  // daily ESPN sync, which beats the sheet value. When staff have manually
  // marked someone Free Agent/Retired, the synced ESPN team is stale by
  // definition (ESPN keeps the last club on the record) — skip it.
  const manualOut = /free agent|retired/i.test(String(ext['status'] || ''));
  let team = String(ext['teamOverride'] || '').trim() || (!manualOut && String(ext['espnTeam'] || '').trim()) || sheetTeam;
  // A blank NFL team means free agent — label it so displays don't fall back
  // to the college field (screens render `nflTeam || college`).
  if (isNFL && !String(team || '').trim()) team = 'Free Agent';
  const status = ext['status'] ? ext['status'] : (isNFL ? deriveStatus(team) : 'Active');
  const tabTiktok = handle(row['TikTok'] || row['Tiktok'] || '');
  const nflTeam = isNFL ? team : '';
  const college = isNFL ? (ext['college'] || '') : team;
  // Photos: manual override > ESPN headshot (NFL/College) > 247 headshot (HS).
  const photoUrl = ext['photoUrl'] || espnHeadshot(ext['espnId'], ext['espnSport'] || (isNFL ? 'nfl' : 'college')) || ext['photo247'] || '';
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
    height: ext['height'] || ext['espnHeight'] || '',
    weight: ext['weight'] || ext['espnWeight'] || '',
    jerseyNumber: ext['jerseyNumber'] || ext['espnJersey'] || '',
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
    // Raw sheet value only (photoUrl above falls back to the derived ESPN
    // headshot) — the edit form binds to this so auto images stay blank there.
    photoUrlOverride: ext['photoUrl'] || '',
    heroImageUrl: ext['heroImageUrl'] || '',
    profileUrl247: ext['profileUrl247'] || '',
    // Manual team override (trade/transfer grace period) — raw value for the
    // edit form; blank means "follow ESPN / the sheet".
    teamOverride: ext['teamOverride'] || '',
    // Ourlads depth chart (synced daily by api/refresh-depth.js).
    depthRank: parseInt(ext['depthRank'], 10) || 0,
    depthPos: ext['depthPos'] || '',
    // ── internal-only (stripped for anonymous visitors) ──
    // 7-day follower growth, computed by the daily socials job from the
    // SocialHistory snapshots (dashboard "Hot this week" tile).
    growth7d: parseInt(ext['growth7d'], 10) || 0,
    growth7dPct: ext['growth7dPct'] != null ? String(ext['growth7dPct']) : '',
    growthDays: parseInt(ext['growthDays'], 10) || 0,
    // Contract: manual yearly amount (AppData contractValue — the college flow)
    // beats the Spotrac sync; the auto fields carry full NFL terms. Internal
    // only — none of these are in PUBLIC_FIELDS.
    contractYearly: ext['contractValue'] || '',
    contractTotal: ext['contractTotal'] || '',
    contractAav: ext['contractAav'] || '',
    contractYears: ext['contractYears'] || '',
    contractGuaranteed: ext['contractGuaranteed'] || '',
    contractUrl: ext['contractUrl'] || '',
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
  // Brand-facing marketing content (the "beyond ESPN" value):
  'brands', 'interests',
]);
const pickPublic = a => {
  const o = {};
  for (const k of Object.keys(a)) if (PUBLIC_FIELDS.has(k)) o[k] = a[k];
  return o;
};

// Deck previews: each Box share page exposes the current PDF's cover as
// og:image, but the URL is pinned to the file VERSION — so resolve it fresh
// (cached per warm instance) and re-uploaded decks keep a working preview.
const DECK_LINKS = [
  { title: 'Sports deck', desc: 'Company overview — always the latest version.', url: 'https://milkhoneyla.box.com/s/mbtbvud2p7rgjloiq49tygxn4az1zkie' },
  { title: 'NIL deck', desc: 'NIL-specific pitch — always the latest version.', url: 'https://milkhoneyla.box.com/s/415ekwg8iukftyr28bp924zfm5wp3rox' },
];
let deckCache = { at: 0, decks: null };
async function getDecks() {
  if (deckCache.decks && Date.now() - deckCache.at < 6 * 3600 * 1000) return deckCache.decks;
  const decks = await Promise.all(DECK_LINKS.map(async d => {
    try {
      const r = await fetch(d.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
      const html = await r.text();
      const m = html.match(/property="og:image" content="([^"]+)"/);
      return { ...d, thumb: m ? m[1].replace(/&amp;/g, '&') : '' };
    } catch { return { ...d, thumb: '' }; }
  }));
  deckCache = { at: Date.now(), decks };
  return decks;
}

// ── Write support (admin-only) ────────────────────────────────────────────────
// Base tabs own identity fields (Name/Position/Team/socials, addressed by
// _rowIndex); AppData owns the enrichment fields (matched by athlete name, or
// appended if the athlete has no AppData row yet). Only columns that actually
// exist in the sheet are written.
const BASE_TAB = { 'NFL': 'NFL', 'College': 'College', 'High School': 'Highschool' };
// Remove an athlete: delete their base-tab row, then best-effort janitor the
// AppData / AutoSync satellite rows (those are keyed by name).
async function deleteAthlete(token, body) {
  const tab = BASE_TAB[body.level];
  const row = parseInt(body.row, 10);
  if (!tab || !row || row < 2) throw new Error('Bad delete request');
  const gid = await getSheetGid(token, tab);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Delete error: ${d.error.code} ${d.error.message}`);
  const nm = String(body.name || '').toLowerCase().trim();
  if (!nm) return;
  for (const t of ['AppData', 'AutoSync']) {
    try {
      const data = await sheetGet(token, `'${t}'!A:AZ`);
      const rows = data.values || [];
      const hdr = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());
      const nc = hdr.findIndex(h => h === 'name');
      if (nc < 0) continue;
      const idx = rows.findIndex((r2, i) => i > 0 && String(r2[nc] || '').toLowerCase().trim() === nm);
      if (idx <= 0) continue;
      const gid2 = await getSheetGid(token, t);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: gid2, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }] }),
      });
    } catch { /* satellite cleanup is best-effort */ }
  }
}

async function saveAthlete(token, body) {
  const a = body.athlete || {};
  const originalName = String(body.originalName || a.name || '').trim();
  // No row reference → this is a brand-new athlete (append, don't update).
  const creating = !a._rowIndex;
  // Level moves (HS → College → NFL) relocate the row between base tabs.
  const prevLevel = BASE_TAB[body.prevLevel] ? body.prevLevel : a.level;
  const levelChanged = !creating && prevLevel !== a.level;
  const tab = BASE_TAB[a.level];
  if (!tab) throw new Error('Missing level');
  if (!String(a.name || '').trim()) throw new Error('Name is required');

  // 1) Base tab updates (only headers that exist).
  const baseHeaders = ((await sheetGet(token, `${tab}!1:1`)).values?.[0] || []).map(h => String(h || '').trim());
  const baseVals = {
    'Name': a.name, 'Position': a.position,
    'Team': a.level === 'NFL' ? a.nflTeam : undefined,
    'School': a.level !== 'NFL' ? a.college : undefined,
    'Instagram': a.instagram, 'Twitter': a.twitter, 'TikTok': a.tiktok, 'Tiktok': a.tiktok,
    'Agent': a.agentAssigned, 'Lead Agent': a.agentAssigned,
    'Birthday': a.birthday,
    'ClassOf': a.level === 'High School' ? a.classOf : undefined,
    'Class Of': a.level === 'High School' ? a.classOf : undefined,
    'Commitment': a.level === 'High School' ? a.committedTo : undefined,
    'Committed': a.level === 'High School' ? a.committedTo : undefined,
    'Shirt': a.shirtSize, 'Hoodie': a.hoodieSize, 'Shorts': a.shortsSize,
    'Pants': a.sweatpantsSize, 'Shoes': a.shoeSize, 'Gloves': a.glovesSize,
    'Gaming System': a.gamingSystem,
  };
  const updates = [];
  if (creating) {
    await sheetAppend(token, `${tab}!A:Z`, baseHeaders.map(h => baseVals[h] === undefined ? '' : String(baseVals[h] ?? '')));
  } else if (levelChanged) {
    // Append a fresh row to the new level's tab, then delete the old row.
    // AppData / AutoSync are keyed by name so they follow automatically.
    const newRow = baseHeaders.map(h => baseVals[h] === undefined ? '' : String(baseVals[h] ?? ''));
    await sheetAppend(token, `${tab}!A:Z`, newRow);
    const gid = await getSheetGid(token, BASE_TAB[prevLevel]);
    const rDel = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: a._rowIndex - 1, endIndex: a._rowIndex } } }] }),
    });
    const dDel = await rDel.json();
    if (dDel.error) throw new Error(`Level move error: ${dDel.error.code} ${dDel.error.message}`);
  } else {
    baseHeaders.forEach((h, i) => {
      if (baseVals[h] !== undefined) updates.push({ range: `${tab}!${colLetter(i)}${a._rowIndex}`, values: [[String(baseVals[h] ?? '')]] });
    });
  }

  // 2) AppData updates (find row by name; append if absent).
  const app = await sheetGet(token, 'AppData!A:AZ');
  const appRows = app.values || [];
  const appHeaders = (appRows[0] || []).map(h => String(h || '').trim());
  const nameCol = appHeaders.findIndex(h => h.toLowerCase() === 'name');
  const extVals = {
    bio: a.bio, hometown: a.hometown, height: a.height, weight: a.weight,
    jerseyNumber: a.jerseyNumber,
    // Only the manual override goes in the sheet — never the derived ESPN URL.
    photoUrl: a.photoUrlOverride !== undefined ? a.photoUrlOverride : a.photoUrl,
    heroImageUrl: a.heroImageUrl,
    teamOverride: a.teamOverride,
    profileUrl247: a.profileUrl247,
    espnId: a.espnId,
    contractValue: a.contractYearly,
    status: a.status, tiktok: a.tiktok,
    interests: Array.isArray(a.interests) ? a.interests.join(', ') : a.interests,
    brands: Array.isArray(a.brands) ? a.brands.join(', ') : a.brands,
    public: a.public === undefined ? undefined : (a.public ? 'TRUE' : 'FALSE'),
    name: a.name,
  };
  // Header lookup tolerant of sheet-side casing (Name vs name, Public vs public).
  const getExt = (h) => {
    if (extVals[h] !== undefined) return extVals[h];
    const k = Object.keys(extVals).find(x => x.toLowerCase() === h.toLowerCase());
    return k ? extVals[k] : undefined;
  };
  const rowNum = nameCol < 0 ? -1 : appRows.findIndex((r, i) =>
    i > 0 && String(r[nameCol] || '').toLowerCase().trim() === originalName.toLowerCase());
  if (rowNum > 0) {
    appHeaders.forEach((h, i) => {
      const v = getExt(h);
      if (v !== undefined) updates.push({ range: `AppData!${colLetter(i)}${rowNum + 1}`, values: [[String(v ?? '')]] });
    });
    await sheetBatchUpdate(token, updates);
  } else {
    await sheetBatchUpdate(token, updates);
    const newRow = appHeaders.map(h => { const v = getExt(h); return v === undefined ? '' : String(v ?? ''); });
    if (appHeaders.length) await sheetAppend(token, 'AppData!A:AZ', newRow);
  }

  // 3) Follower counts are robot-owned (AutoSync tab) but stay hand-editable
  //    from the form — upsert them there by name.
  const fol = { igFollowers: a.igFollowers, twitterFollowers: a.twitterFollowers, tiktokFollowers: a.tiktokFollowers };
  if (Object.values(fol).some(v => v !== undefined)) {
    try {
      const autoD = await sheetGet(token, "'AutoSync'!A:F");
      const aRows = autoD.values || [];
      const aHead = (aRows[0] || []).map(h => String(h || '').trim());
      const anIdx = aHead.findIndex(h => h.toLowerCase() === 'name');
      if (anIdx >= 0) {
        let autoRow = 0;
        aRows.forEach((r, i) => { if (i > 0 && !autoRow && String(r[anIdx] || '').toLowerCase().trim() === originalName.toLowerCase()) autoRow = i + 1; });
        if (autoRow) {
          const ups = [];
          aHead.forEach((h, i) => { if (fol[h] !== undefined) ups.push({ range: `'AutoSync'!${colLetter(i)}${autoRow}`, values: [[String(fol[h] ?? '')]] }); });
          if (a.name && a.name !== originalName) ups.push({ range: `'AutoSync'!${colLetter(anIdx)}${autoRow}`, values: [[a.name]] });
          await sheetBatchUpdate(token, ups);
        } else {
          await sheetAppend(token, "'AutoSync'!A:F", aHead.map((h, i) => i === anIdx ? a.name : (fol[h] !== undefined ? String(fol[h] ?? '') : '')));
        }
      }
    } catch { /* AutoSync not created yet (pre-migration) — skip */ }
  }
}

// ── Generic admin tabs (Recruiting Info / NFL Team Info / State Registration) ─
// Served raw (headers + rows) so the UI adapts to whatever columns the sheet
// has. Admin-only in both directions; writes are limited to Recruiting Info.
const ADMIN_TABS = {
  // ensureCols: headers the app needs that the sheet may predate — appended
  // (with grid growth) on first read so nobody has to touch the sheet by hand.
  recruiting: { title: 'Recruiting Info', writable: true, ensureCols: ['Stage'] },
  nflteams: { title: 'NFL Team Info', writable: false },
  stateregs: { title: 'State Registration', writable: false },
  appdata: { title: 'AppData', writable: false },
  stafflegacy: { title: 'Staff', writable: false },
  readme: { title: 'README', writable: true },
  onboarding: { title: 'Onboarding', writable: true }, // form-fed log — writable so staff can janitor junk submissions
  socialhistory: { title: 'SocialHistory', writable: false }, // robot snapshots — growth board + sparklines
  stathistory: { title: 'StatHistory', writable: false },     // robot snapshots — depth/rank trend tracking
  todos: { title: 'Todos', writable: true, autoCreate: ['text', 'createdBy', 'createdAt', 'done'] }, // dashboard to-do list
  // Brand deal tracker — one row per deal; clients is a comma list of roster
  // names; fileId/fileName point at the deal file in Box (copied into each
  // tagged player's folder at upload time).
  branddeals: { title: 'BrandDeals', writable: true, autoCreate: ['company', 'clients', 'category', 'value', 'deliverables', 'dateSubmitted', 'fileId', 'fileName', 'createdBy'] },
};
const tabRange = title => `'${title}'!A:AZ`;
async function getSheetGid(token, title) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets meta error: ${d.error.code} ${d.error.message}`);
  const hit = (d.sheets || []).find(s => (s.properties?.title || '').trim().toLowerCase() === title.toLowerCase());
  if (!hit) throw new Error(`Tab "${title}" not found`);
  return hit.properties.sheetId;
}
async function readAdminTab(token, tab) {
  const data = await sheetGet(token, tabRange(tab.title));
  const values = data.values || [];
  // Row 1 isn't always a real header row (e.g. NFL Team Info is block-shaped),
  // so size every row to the widest row in the tab, not to row 1.
  const width = values.reduce((m, r) => Math.max(m, r.length), 0);
  const headers = Array.from({ length: width }, (_, j) => String((values[0] || [])[j] ?? '').trim());
  const rows = values.slice(1)
    .map((r, i) => ({ _row: i + 2, cells: Array.from({ length: width }, (_, j) => String(r[j] ?? '').trim()) }))
    .filter(r => r.cells.some(c => c));
  return { headers, rows };
}
// Append any missing ensureCols headers to a tab (growing the grid when the
// sheet is already at its column limit) and return the updated header list.
async function ensureTabCols(token, tab, headers) {
  const missing = (tab.ensureCols || []).filter(c => !headers.some(h => h.toLowerCase() === c.toLowerCase()));
  if (!missing.length) return headers;
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties))`, {
    headers: { Authorization: `Bearer ${token}` } })).json();
  const sheet = (meta.sheets || []).find(s => (s.properties?.title || '').trim().toLowerCase() === tab.title.toLowerCase());
  if (!sheet) throw new Error(`Tab "${tab.title}" not found`);
  const gid = sheet.properties.sheetId;
  const colCount = sheet.properties.gridProperties?.columnCount || headers.length;
  const need = headers.length + missing.length - colCount;
  if (need > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ appendDimension: { sheetId: gid, dimension: 'COLUMNS', length: need } }] }),
    });
  }
  await sheetBatchUpdate(token, missing.map((c, i) => ({ range: `'${tab.title}'!${colLetter(headers.length + i)}1`, values: [[c]] })));
  return [...headers, ...missing];
}

async function handleTabAction(token, body) {
  const tab = ADMIN_TABS[body.tab];
  if (!tab) throw new Error('Unknown tab');
  if (!tab.writable) throw new Error('This tab is read-only');
  const headers = ((await sheetGet(token, `'${tab.title}'!1:1`)).values?.[0] || []).map(h => String(h || '').trim());
  const vals = body.values || {};
  const valFor = h => {
    const k = Object.keys(vals).find(x => x.trim().toLowerCase() === h.toLowerCase());
    return k === undefined ? undefined : vals[k];
  };
  if (body.action === 'tab-update') {
    const row = parseInt(body.row, 10);
    if (!row || row < 2) throw new Error('Bad row');
    const updates = [];
    headers.forEach((h, i) => {
      const v = valFor(h);
      if (v !== undefined) updates.push({ range: `'${tab.title}'!${colLetter(i)}${row}`, values: [[String(v ?? '')]] });
    });
    await sheetBatchUpdate(token, updates);
  } else if (body.action === 'tab-append') {
    await sheetAppend(token, tabRange(tab.title), headers.map(h => { const v = valFor(h); return v === undefined ? '' : String(v ?? ''); }));
  } else if (body.action === 'tab-delete') {
    const row = parseInt(body.row, 10);
    if (!row || row < 2) throw new Error('Bad row');
    const gid = await getSheetGid(token, tab.title);
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(`Sheets delete error: ${d.error.code} ${d.error.message}`);
  } else {
    throw new Error('Unknown tab action');
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!SHEET_ID) return res.json({ athletes: [], isAdmin: false, authConfigured: false, notConfigured: true });

  if (req.method === 'POST') {
    const { configured, admin } = authState(req);
    if (configured && !admin) return res.status(403).json({ error: 'Log in to edit athletes.' });
    try {
      const token = await getToken('https://www.googleapis.com/auth/spreadsheets');

      // One-time/maintenance: mark every athlete on the current roster tabs as
      // Public in AppData (adding rows for those without one). AppData-only
      // people (e.g. prospects) are left untouched, so they stay hidden.
      if ((req.body || {}).action === 'backfill-public') {
        const [nfl, col, hs, app] = await Promise.all([
          sheetGet(token, 'NFL!A:P'), sheetGet(token, 'College!A:Q'),
          sheetGet(token, 'Highschool!A:S'), sheetGet(token, 'AppData!A:AZ'),
        ]);
        const rosterNames = new Set([...parseRows(nfl), ...parseRows(col), ...parseRows(hs)]
          .map(r => String(r['Name'] || '').toLowerCase().trim()).filter(Boolean));
        const appRows = app.values || [];
        const headers = (appRows[0] || []).map(h => String(h || '').trim());
        const nameCol = headers.findIndex(h => h.toLowerCase() === 'name');
        const pubCol = headers.findIndex(h => h.toLowerCase() === 'public');
        if (nameCol < 0 || pubCol < 0) return res.status(400).json({ error: 'AppData needs name + Public columns' });
        const updates = [];
        const seen = new Set();
        appRows.forEach((r, i) => {
          if (i === 0) return;
          const n = String(r[nameCol] || '').toLowerCase().trim();
          if (!n || !rosterNames.has(n)) return;
          seen.add(n);
          if (String(r[pubCol] || '').trim().toUpperCase() !== 'TRUE') {
            updates.push({ range: `AppData!${colLetter(pubCol)}${i + 1}`, values: [['TRUE']] });
          }
        });
        await sheetBatchUpdate(token, updates);
        // Roster athletes with no AppData row yet: append name + Public TRUE.
        const missing = [...rosterNames].filter(n => !seen.has(n));
        const properName = {};
        [...parseRows(nfl), ...parseRows(col), ...parseRows(hs)].forEach(r => {
          const n = String(r['Name'] || '').trim(); if (n) properName[n.toLowerCase()] = n;
        });
        for (const n of missing) {
          const row = headers.map((h, i) => i === nameCol ? properName[n] : (i === pubCol ? 'TRUE' : ''));
          await sheetAppend(token, 'AppData!A:AZ', row);
        }
        return res.json({ success: true, flagged: updates.length, appended: missing.length, rosterCount: rosterNames.size });
      }

      // Login bootstrap helpers (admin-gated). Logins live in the Staff tab
      // (directory + Password/Role/Agent Key columns after the merge).
      if ((req.body || {}).action === 'setup-users') {
        const staffD = await sheetGet(token, "'Staff'!A:J");
        const sRows = staffD.values || [];
        const sHead = (sRows[0] || []).map(h => String(h || '').trim());
        const sc = n => sHead.findIndex(h => h.toLowerCase() === n.toLowerCase());
        const nameC = sc('name'), passC = sc('password');
        if (nameC < 0 || passC < 0) throw new Error('Staff tab needs name + Password columns');
        if (Array.isArray(req.body.seedRow)) {
          const [nm, pw, role] = req.body.seedRow.map(v => String(v ?? ''));
          const vals = { password: pw, role };
          await sheetAppend(token, "'Staff'!A:J", sHead.map((h, i) => {
            if (i === nameC) return nm;
            const v = vals[h.toLowerCase()];
            return v !== undefined ? v : '';
          }));
        }
        if (req.body.removeName) {
          const idx = sRows.findIndex((r, i) => i > 0
            && String(r[nameC] || '').trim().toLowerCase() === String(req.body.removeName).trim().toLowerCase()
            && String(r[passC] || '').trim()); // only rows that are logins — never a directory-only row
          if (idx > 0) {
            const gid = await getSheetGid(token, 'Staff');
            const rr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
              method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }] }),
            });
            const dd = await rr.json();
            if (dd.error) throw new Error(dd.error.message);
          }
        }
        return res.json({ success: true });
      }

      // Test-data janitor: deletes rows whose name starts with "ZZ " from the
      // given tabs. The prefix guard is hard-coded so this can never touch a
      // real person's row.
      if ((req.body || {}).action === 'delete-test-rows') {
        const prefix = /^zz /i;
        const TABS = { 'NFL': 'NFL!A:P', 'College': 'College!A:Q', 'Highschool': 'Highschool!A:S', 'AppData': 'AppData!A:AZ', 'AutoSync': "'AutoSync'!A:L", 'Onboarding': "'Onboarding'!A:X" };
        const removed = {};
        for (const [title, range] of Object.entries(TABS)) {
          const data = await sheetGet(token, range).catch(() => null);
          if (!data) continue;
          const rows = data.values || [];
          const heads = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
          const nameIdx = heads.indexOf('name');
          if (nameIdx < 0) continue;
          const hits = [];
          rows.forEach((r, i) => { if (i > 0 && prefix.test(String(r[nameIdx] || '').trim())) hits.push(i); });
          if (!hits.length) continue;
          const gid = await getSheetGid(token, title);
          const rr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: hits.sort((a, b) => b - a).map(i => ({ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } })) }),
          });
          const dd = await rr.json();
          if (dd.error) throw new Error(dd.error.message);
          removed[title] = hits.length;
        }
        return res.json({ success: true, removed });
      }

      // Remove the Agent Key column from Staff (matching now uses names).
      if ((req.body || {}).action === 'drop-agent-key') {
        const head = await sheetGet(token, "'Staff'!1:1");
        const idx = (head.values?.[0] || []).findIndex(h => String(h || '').trim().toLowerCase() === 'agent key');
        if (idx < 0) return res.json({ success: true, dropped: false });
        const gid = await getSheetGid(token, 'Staff');
        const rr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 } } }] }),
        });
        const dd = await rr.json();
        if (dd.error) throw new Error(dd.error.message);
        return res.json({ success: true, dropped: true });
      }

      // Reconcile the Staff tab to a provided canonical list of
      // { name, role } entries: canonical spellings win, roles are set,
      // missing people appended, rows not on the list deleted, and empty
      // Agent Keys default to first names. Directory columns (title/location/
      // photo) and existing passwords are preserved for kept rows.
      if ((req.body || {}).action === 'sync-staff' && Array.isArray(req.body.staff)) {
        const want = req.body.staff.map(x => ({ name: String(x.name || '').trim(), role: String(x.role || 'agent').trim().toLowerCase() })).filter(x => x.name);
        const staffD = await sheetGet(token, "'Staff'!A:J");
        const rows = staffD.values || [];
        const heads = (rows[0] || []).map(h => String(h || '').trim());
        const hc = n => heads.findIndex(h => h.toLowerCase() === n.toLowerCase());
        const nameC = hc('name'), roleC = hc('role');
        if (nameC < 0 || roleC < 0) throw new Error('Staff needs name/Role columns');
        const NICK = { mike: 'michael', michael: 'mike', dave: 'david', dan: 'daniel', matt: 'matthew', greg: 'gregory', rob: 'robert', will: 'william', tom: 'thomas', sam: 'sammy', sammy: 'sam' };
        const matches = (a, b) => {
          const la = a.toLowerCase(), lb = b.toLowerCase();
          if (la === lb) return true;
          const pa = la.split(/\s+/), pb = lb.split(/\s+/);
          if (pa.length < 2 || pb.length < 2) return false;
          if (pa[pa.length - 1] !== pb[pb.length - 1]) return false;   // last name
          return pa[0] === pb[0] || NICK[pa[0]] === pb[0] || NICK[pb[0]] === pa[0] || pa[0][0] === pb[0][0];
        };
        const ups = [];
        const usedRows = new Set();
        const missing = [];
        for (const w of want) {
          let rowNum = 0;
          rows.forEach((r, i) => {
            if (i === 0 || rowNum || usedRows.has(i)) return;
            if (String(r[nameC] || '').trim() && matches(String(r[nameC]).trim(), w.name)) { rowNum = i + 1; usedRows.add(i); }
          });
          if (rowNum) {
            const r = rows[rowNum - 1];
            if (String(r[nameC]).trim() !== w.name) ups.push({ range: `'Staff'!${colLetter(nameC)}${rowNum}`, values: [[w.name]] });
            if (String(r[roleC] || '').trim().toLowerCase() !== w.role) ups.push({ range: `'Staff'!${colLetter(roleC)}${rowNum}`, values: [[w.role]] });
          } else {
            missing.push(w);
          }
        }
        await sheetBatchUpdate(token, ups);
        for (const w of missing) {
          await sheetAppend(token, "'Staff'!A:J", heads.map((h, i) => {
            if (i === nameC) return w.name;
            if (i === roleC) return w.role;
            return '';
          }));
        }
        // Delete rows not on the list (descending so indexes hold).
        const removeIdx = [];
        const removedNames = [];
        rows.forEach((r, i) => {
          if (i === 0 || usedRows.has(i)) return;
          const n = String(r[nameC] || '').trim();
          if (n) { removeIdx.push(i); removedNames.push(n); }
        });
        if (removeIdx.length) {
          const gid = await getSheetGid(token, 'Staff');
          const reqs = removeIdx.sort((a, b) => b - a).map(i => ({
            deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } }));
          const rr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: reqs }),
          });
          const dd = await rr.json();
          if (dd.error) throw new Error(dd.error.message);
        }
        return res.json({ success: true, updated: ups.length, added: missing.map(m => m.name), removed: removedNames });
      }

      // Wire the sheet's agent dropdowns (Lead Agent on roster tabs, Agent on
      // Recruiting Info) to pull from the Staff directory's Name column —
      // music-sheet style. Also normalizes existing short values ("Jake") to
      // full directory names ("Jake Presser") when the first name matches
      // exactly one staff member.
      if ((req.body || {}).action === 'wire-agent-dropdowns') {
        const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`, {
          headers: { Authorization: `Bearer ${token}` } });
        const meta = await metaR.json();
        const gidOf = t => (meta.sheets || []).find(s => s.properties.title === t)?.properties.sheetId;
        const sheetReq = async (requests) => {
          if (!requests.length) return;
          const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests }),
          });
          const d = await r.json();
          if (d.error) throw new Error(d.error.message);
        };
        const staffD = await sheetGet(token, "'Staff'!A:A");
        const staffNames = (staffD.values || []).slice(1).map(r => String(r[0] || '').trim()).filter(Boolean);
        const firstMap = {};
        for (const n of staffNames) {
          const f = n.split(' ')[0].toLowerCase();
          firstMap[f] = f in firstMap ? null : n; // null = ambiguous first name
        }
        // These tabs use Google Sheets Tables (typed columns) — dropdown
        // options live on the table column itself, so we update them via
        // updateTable rather than classic data validation.
        const tmeta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(title),tables)`, {
          headers: { Authorization: `Bearer ${token}` } })).json();
        const targets = [
          { tab: 'NFL', range: 'NFL!A:P' }, { tab: 'College', range: 'College!A:Q' },
          { tab: 'Highschool', range: 'Highschool!A:S' }, { tab: 'Recruiting Info', range: "'Recruiting Info'!A:AZ" },
        ];
        // Match a stray value ("Sammy", "Mike Simon") to one staff member:
        // exact, unique first name (nicknames included), or same last name +
        // first initial.
        const NICKNAMES = { mike: 'michael', michael: 'mike', dave: 'david', dan: 'daniel', danny: 'daniel', matt: 'matthew', greg: 'gregory', rob: 'robert', bob: 'robert', will: 'william', bill: 'william', tom: 'thomas', tony: 'anthony', jim: 'james', joe: 'joseph', sam: 'sammy', sammy: 'sam' };
        const resolveName = (v) => {
          const lv = v.toLowerCase();
          const exact = staffNames.find(n => n.toLowerCase() === lv);
          if (exact) return exact;
          if (firstMap[lv]) return firstMap[lv];
          if (NICKNAMES[lv] && firstMap[NICKNAMES[lv]]) return firstMap[NICKNAMES[lv]];
          const parts = lv.split(/\s+/);
          if (parts.length >= 2) {
            const hits = staffNames.filter(n => {
              const np = n.toLowerCase().split(/\s+/);
              return np[np.length - 1] === parts[parts.length - 1] && np[0][0] === parts[0][0];
            });
            if (hits.length === 1) return hits[0];
          }
          return null;
        };
        // Pass -1: purge junk Staff rows a prior run may have created from
        // unsplit multi-agent values ("AJ/Adam") or bare first names ("Matt")
        // that duplicate a full-name row.
        {
          const staffFull = await sheetGet(token, "'Staff'!A:A");
          const sRows = (staffFull.values || []);
          const junkIdx = [];
          sRows.forEach((r, i) => {
            if (i === 0) return;
            const n = String(r[0] || '').trim();
            if (!n) return;
            const isSlash = n.includes('/');
            const nickOf = { mike: 'michael', dave: 'david', dan: 'daniel', matt: 'matthew', greg: 'gregory', rob: 'robert', will: 'william', tom: 'thomas', sam: 'sammy' };
            const firsts = [n.toLowerCase(), nickOf[n.toLowerCase()]].filter(Boolean);
            const isBareDupe = !n.includes(' ') && sRows.some((r2, j) => j > 0 && j !== i
              && firsts.some(f => String(r2[0] || '').trim().toLowerCase().startsWith(f + ' ')));
            if (isSlash || isBareDupe) junkIdx.push(i);
          });
          if (junkIdx.length) {
            const gid = await getSheetGid(token, 'Staff');
            await sheetReq(junkIdx.sort((a, b) => b - a).map(i => ({
              deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } })));
            // Re-read the directory after the purge.
            const again = await sheetGet(token, "'Staff'!A:A");
            staffNames.length = 0;
            (again.values || []).slice(1).forEach(r => { const n = String(r[0] || '').trim(); if (n) staffNames.push(n); });
            Object.keys(firstMap).forEach(k => delete firstMap[k]);
            for (const n of staffNames) { const f = n.split(' ')[0].toLowerCase(); firstMap[f] = f in firstMap ? null : n; }
          }
        }

        // Pass 0: cells can hold multiple agents ("A, B" or "A/B"). Scan every
        // agent cell, resolve each part, and add genuinely unknown agents to
        // the Staff directory (name-only rows) so the directory is the
        // complete source of truth before we point dropdowns at it.
        const tabData = {};
        const missingStaff = new Set();
        for (const t of targets) {
          const data = await sheetGet(token, t.range);
          tabData[t.tab] = data;
          const rows = data.values || [];
          const heads = (rows[0] || []).map(h => String(h || '').trim());
          const colIdx = heads.findIndex(h => /^(lead\s+)?agent$/i.test(h));
          if (colIdx < 0) continue;
          rows.forEach((r, i) => {
            if (i === 0) return;
            for (const part of String(r[colIdx] || '').split(/[,/]+/).map(x => x.trim()).filter(Boolean)) {
              if (!staffNames.includes(part) && !resolveName(part)) missingStaff.add(part);
            }
          });
        }
        for (const nm of missingStaff) {
          await sheetAppend(token, "'Staff'!A:J", [nm]);
          staffNames.push(nm);
          const f = nm.split(' ')[0].toLowerCase();
          firstMap[f] = f in firstMap ? null : nm;
        }

        const normalized = {};
        const unmatched = new Set();
        let dropdownsWired = 0;
        for (const t of targets) {
          const sheetTables = (tmeta.sheets || []).find(s => s.properties.title === t.tab)?.tables || [];
          const data = tabData[t.tab];
          const rows = data.values || [];
          const heads = (rows[0] || []).map(h => String(h || '').trim());
          const colIdx = heads.findIndex(h => /^(lead\s+)?agent$/i.test(h));
          if (colIdx < 0) continue;
          // 1) Normalize existing values to canonical directory names —
          //    part by part, preserving multi-agent lists — and collect the
          //    distinct multi-agent combinations in this column.
          const ups = [];
          const combos = new Set();
          rows.forEach((r, i) => {
            if (i === 0) return;
            const v = String(r[colIdx] || '').trim();
            if (!v) return;
            const parts = v.split(/[,/]+/).map(x => x.trim()).filter(Boolean);
            const fixed = parts.map(p => staffNames.includes(p) ? p : (resolveName(p) || p));
            parts.forEach((p, j) => { if (!staffNames.includes(fixed[j])) unmatched.add(p); });
            const joined = fixed.join(', ');
            if (parts.length > 1 && fixed.every(f => staffNames.includes(f))) combos.add(joined);
            if (joined !== v) ups.push({ range: `'${t.tab}'!${colLetter(colIdx)}${i + 1}`, values: [[joined]] });
          });
          // 2) Point the table column's dropdown at the Staff directory names,
          //    plus this column's existing multi-agent combos — the Sheets API
          //    can't enable "allow multiple selections" on typed columns, so
          //    combos must be options themselves to render as valid chips.
          const table = sheetTables.find(x => (x.columnProperties || []).some(c => /agent/i.test(String(c.columnName || '').trim())));
          if (table) {
            const colProp = (table.columnProperties || []).find(c => /agent/i.test(String(c.columnName || '').trim()));
            const options = [...staffNames, ...[...combos].sort()];
            await sheetReq([{ updateTable: {
              table: { tableId: table.tableId, columnProperties: [{
                columnIndex: colProp.columnIndex, columnName: colProp.columnName, columnType: 'DROPDOWN',
                dataValidationRule: { condition: { type: 'ONE_OF_LIST', values: options.map(n => ({ userEnteredValue: n })) } },
              }] },
              fields: 'columnProperties',
            } }]);
            dropdownsWired++;
          }
          if (ups.length) { await sheetBatchUpdate(token, ups); normalized[t.tab] = ups.length; }
        }
        return res.json({ success: true, dropdownsWired, staffCount: staffNames.length, staffAdded: [...missingStaff], normalized, unmatched: [...unmatched].slice(0, 20) });
      }

      // Final tidy pass (2026-07 cleanup, Tyler-approved): merge Users into
      // Staff, then order/hide/color every tab so humans see only the 8 they
      // work in. Hidden tabs stay fully API-accessible.
      if ((req.body || {}).action === 'organize-sheet') {
        const out = {};
        const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,index,hidden,gridProperties(columnCount)))`, {
          headers: { Authorization: `Bearer ${token}` } });
        const meta = await metaR.json();
        const sheets = (meta.sheets || []).map(s => s.properties);
        const byTitle = t => sheets.find(s => s.title === t);
        const sheetReq = async (requests) => {
          if (!requests.length) return;
          const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests }),
          });
          const d = await r.json();
          if (d.error) throw new Error(d.error.message);
        };
        // 1) Merge Users -> Staff (Password / Role / Agent Key columns).
        const usersSh = byTitle('Users'), staffSh = byTitle('Staff');
        if (usersSh && staffSh) {
          const staffD = await sheetGet(token, "'Staff'!A:J");
          const sRows = staffD.values || [];
          let sHead = (sRows[0] || []).map(h => String(h || '').trim());
          const need = ['Password', 'Role', 'Agent Key'].filter(h => !sHead.some(x => x.toLowerCase() === h.toLowerCase()));
          if (need.length) {
            const width = staffSh.gridProperties?.columnCount || sHead.length;
            if (sHead.length + need.length > width) {
              await sheetReq([{ appendDimension: { sheetId: staffSh.sheetId, dimension: 'COLUMNS', length: sHead.length + need.length - width } }]);
            }
            await sheetBatchUpdate(token, [{ range: `'Staff'!${colLetter(sHead.length)}1`, values: [need] }]);
            sHead = [...sHead, ...need];
          }
          const sc = n => sHead.findIndex(h => h.toLowerCase() === n.toLowerCase());
          const sName = sc('name'), sPass = sc('password'), sRole = sc('role'), sKey = sc('agent key');
          const uD = await sheetGet(token, "'Users'!A:F");
          const uRows = uD.values || [];
          const uHead = (uRows[0] || []).map(h => String(h || '').trim().toLowerCase());
          const uc = n => uHead.indexOf(n);
          const uName = uc('name'), uPass = uc('password'), uRole = uc('role'), uKey = uc('agent key');
          const norm = s => String(s || '').toLowerCase().trim();
          const staffRowByName = {};
          sRows.forEach((r, i) => { if (i > 0) { const n = norm(r[sName]); if (n) staffRowByName[n] = i + 1; } });
          const ups = [];
          let appended = 0;
          for (const r of uRows.slice(1)) {
            const nm = String(r[uName] || '').trim();
            if (!nm) continue;
            const vals = [[sPass, r[uPass]], [sRole, r[uRole]], [sKey, r[uKey]]];
            const rowNum = staffRowByName[norm(nm)];
            if (rowNum) {
              for (const [ci, v] of vals) if (ci >= 0 && String(v || '').trim()) ups.push({ range: `'Staff'!${colLetter(ci)}${rowNum}`, values: [[String(v)]] });
            } else {
              await sheetAppend(token, "'Staff'!A:J", sHead.map((h, i2) => {
                if (i2 === sName) return nm;
                const hit = vals.find(([ci]) => ci === i2);
                return hit && hit[1] !== undefined ? String(hit[1] ?? '') : '';
              }));
              appended++;
            }
          }
          await sheetBatchUpdate(token, ups);
          await sheetReq([{ deleteSheet: { sheetId: usersSh.sheetId } }]);
          out.merged = { updated: ups.length, appended, usersDeleted: true };
        }
        // 2) Order + hide + tab colors: visible working tabs first, machine
        //    tabs hidden, legacy hidden at the very end.
        const GREEN = { red: 0.29, green: 0.67, blue: 0.47 };
        const BLUE = { red: 0.35, green: 0.55, blue: 0.78 };
        const GRAY = { red: 0.62, green: 0.62, blue: 0.62 };
        const plan = [
          ['NFL', false, GREEN], ['College', false, GREEN], ['Highschool', false, GREEN],
          ['Recruiting Info', false, BLUE], ['NFL Team Info', false, BLUE], ['State Registration', false, BLUE],
          ['Staff', false, BLUE], ['Prospects', false, GRAY],
          ['AppData', true, GRAY], ['AutoSync', true, GRAY], ['Onboarding', true, GRAY], ['README', true, GRAY],
          ['UNRL', true, GRAY], ['AS COLOR', true, GRAY], ['Leads', true, GRAY], ['PitchContent', true, GRAY], ['Materials', true, GRAY],
        ];
        const orderReqs = [];
        plan.forEach(([t, hidden, tabColor], i) => {
          const sh = byTitle(t);
          if (!sh) return;
          orderReqs.push({ updateSheetProperties: { properties: { sheetId: sh.sheetId, index: i, hidden, tabColor }, fields: 'index,hidden,tabColor' } });
        });
        await sheetReq(orderReqs);
        out.organized = orderReqs.length;
        return res.json({ success: true, ...out });
      }

      if (String((req.body || {}).action || '').startsWith('tab-')) {
        await handleTabAction(token, req.body || {});
        return res.json({ success: true });
      }

      // One-time sheet restructure (2026-07 cleanup), additive only:
      // AutoSync tab seeded from AppData, Users renamed to Staff (+ new
      // columns), README tab documenting ownership. Idempotent.
      if ((req.body || {}).action === 'migrate-structure') {
        const out = {};
        const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, {
          headers: { Authorization: `Bearer ${token}` } })).json();
        const titles = (meta.sheets || []).map(s => s.properties.title);
        const gidOf = t => (meta.sheets || []).find(s => s.properties.title === t)?.properties.sheetId;
        const sheetReq = async (requests) => {
          const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests }),
          });
          const d = await r.json();
          if (d.error) throw new Error(d.error.message);
          return d;
        };
        // 1) AutoSync: create + seed from AppData (only when empty).
        if (!titles.includes('AutoSync')) await sheetReq([{ addSheet: { properties: { title: 'AutoSync' } } }]);
        const AUTO_HEADERS = ['name', 'igFollowers', 'twitterFollowers', 'tiktokFollowers', 'depthRank', 'depthPos'];
        const autoNow = await sheetGet(token, "'AutoSync'!A:F");
        if (!(autoNow.values || []).length) {
          await sheetBatchUpdate(token, [{ range: "'AutoSync'!A1", values: [AUTO_HEADERS] }]);
          const app = await sheetGet(token, 'AppData!A:AZ');
          const rows = app.values || [];
          const heads = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
          const gi = n => heads.indexOf(n.toLowerCase());
          const cols = AUTO_HEADERS.map(h => gi(h));
          const seed = rows.slice(1)
            .filter(r => String(r[cols[0]] || '').trim())
            .map(r => AUTO_HEADERS.map((_, j) => String(cols[j] >= 0 ? (r[cols[j]] ?? '') : '')));
          for (let i = 0; i < seed.length; i += 200) await sheetAppend2(token, "'AutoSync'!A:F", seed.slice(i, i + 200));
          out.autoSeeded = seed.length;
        }
        // 2) Users tab keeps its name: a legacy "Staff" tab from the old
        //    sports app already exists in this sheet, so renaming would
        //    collide. Logins stay in Users; the legacy Staff tab is the
        //    staff directory.
        // 3) README.
        if (!titles.includes('README')) {
          await sheetReq([{ addSheet: { properties: { title: 'README' } } }]);
          await sheetBatchUpdate(token, [{ range: "'README'!A1", values: [
            ['Tab', 'Who writes it', 'What it holds'],
            ['NFL / College / Highschool', 'Staff + onboarding form', 'Identity per level: name, position, team/school, socials, sizes, birthday, Lead Agent'],
            ['AppData', 'Staff (app edit form) + onboarding form', 'Enrichment: bio, photos, Public flag, status, interests, brands, targets, hometown, measurables, onboardedAt'],
            ['AutoSync', 'Robots only (daily crons)', 'IG/TikTok/X follower counts + Ourlads depthRank/depthPos — do not edit by hand'],
            ['Onboarding', 'Onboarding form (audit log)', 'Every submission, signed + recruit, timestamped — never edited'],
            ['Staff', 'Admins', 'Team logins: Name, Password, Role, Agent Key, Title, Email'],
            ['Recruiting Info', 'Staff (app Recruiting page)', 'Active recruiting board'],
            ['NFL Team Info', 'Staff (by hand)', 'Team facility addresses + front-office contacts (app Resources page)'],
            ['State Registration', 'Staff (by hand)', 'Agent registration status by state (app Resources page)'],
            ['Prospects', 'Legacy', 'Kept per Tyler — not read by the app'],
          ] }]);
          out.readme = true;
        }
        return res.json({ success: true, ...out });
      }

      // Destructive follow-up, run only after migrate-structure is verified:
      // deletes AppData rows for people on no roster tab, then the moved/dead
      // AppData columns.
      if ((req.body || {}).action === 'cleanup-structure') {
        const [nfl2, col2, hs2, app2] = await Promise.all([
          sheetGet(token, 'NFL!A:P'), sheetGet(token, 'College!A:Q'),
          sheetGet(token, 'Highschool!A:S'), sheetGet(token, 'AppData!A:AZ'),
        ]);
        const rosterNames = new Set([...parseRows(nfl2), ...parseRows(col2), ...parseRows(hs2)]
          .map(r => String(r['Name'] || '').toLowerCase().trim()).filter(Boolean));
        const rows = app2.values || [];
        const heads = (rows[0] || []).map(h => String(h || '').trim());
        const nameIdx = heads.findIndex(h => h.toLowerCase() === 'name');
        const gid = await getSheetGid(token, 'AppData');
        const sheetReq = async (requests) => {
          const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests }),
          });
          const d = await r.json();
          if (d.error) throw new Error(d.error.message);
        };
        // Orphan rows (descending indexes so deletes don't shift each other).
        const orphanIdx = [];
        const orphanNames = [];
        rows.forEach((r, i) => {
          if (i === 0) return;
          const n = String(r[nameIdx] || '').toLowerCase().trim();
          if (n && !rosterNames.has(n)) { orphanIdx.push(i); orphanNames.push(r[nameIdx]); }
        });
        if (orphanIdx.length) {
          await sheetReq(orphanIdx.sort((a, b) => b - a).map(i => ({
            deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } })));
        }
        // Moved + dead columns.
        const DROP = ['igFollowers', 'twitterFollowers', 'tiktokFollowers', 'depthRank', 'depthPos', 'igEngagement', 'notes', 'email', 'phone'];
        const dropIdx = heads.map((h, i) => DROP.some(d => d.toLowerCase() === h.toLowerCase()) ? i : -1).filter(i => i >= 0);
        if (dropIdx.length) {
          await sheetReq(dropIdx.sort((a, b) => b - a).map(i => ({
            deleteDimension: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 } } })));
        }
        return res.json({ success: true, orphansDeleted: orphanNames, columnsDropped: dropIdx.length });
      }

      if ((req.body || {}).action === 'delete-athlete') {
        await deleteAthlete(token, req.body);
        return res.json({ success: true });
      }

      await saveAthlete(token, req.body || {});
      return res.json({ success: true });
    } catch (err) {
      console.error('Athlete save error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Admin tab reads (?tab=recruiting|nflteams|stateregs) — never for public sessions.
  const tabKey = (req.query || {}).tab;
  if (tabKey) {
    const { configured, admin } = authState(req);
    if (configured && !admin) return res.status(403).json({ error: 'Admin only' });
    // Diagnostic: raw grid data (values + per-cell validation) for a range.
    if (tabKey === 'griddata') {
      try {
        const token = await getToken();
        const range = String((req.query || {}).range || 'NFL!D1:D10');
        const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${encodeURIComponent(range)}&fields=sheets(data(rowData(values(formattedValue,dataValidation,effectiveValue))))`, {
          headers: { Authorization: `Bearer ${token}` } })).json();
        return res.json(meta);
      } catch (err) { return res.status(500).json({ error: err.message }); }
    }
    // Diagnostic: dump table (typed-column) metadata for the roster tabs.
    if (tabKey === 'tables') {
      try {
        const token = await getToken();
        const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(title),tables)`, {
          headers: { Authorization: `Bearer ${token}` } })).json();
        return res.json({ sheets: (meta.sheets || []).map(s => ({ title: s.properties.title, tables: s.tables || [] })) });
      } catch (err) { return res.status(500).json({ error: err.message }); }
    }
    // Diagnostic: list the spreadsheet's tabs (order + visibility).
    if (tabKey === 'titles') {
      try {
        const token = await getToken();
        const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(title,index,hidden))`, {
          headers: { Authorization: `Bearer ${token}` } })).json();
        return res.json({ titles: (meta.sheets || []).map(s => ({ t: s.properties.title, i: s.properties.index, hidden: !!s.properties.hidden })) });
      } catch (err) { return res.status(500).json({ error: err.message }); }
    }
    const tab = ADMIN_TABS[tabKey];
    if (!tab) return res.status(400).json({ error: 'Unknown tab' });
    try {
      const token = await getToken('https://www.googleapis.com/auth/spreadsheets');
      let out;
      try {
        out = await readAdminTab(token, tab);
        if (tab.ensureCols) out.headers = await ensureTabCols(token, tab, out.headers);
      }
      catch (e) {
        if (!tab.autoCreate) throw e;
        // First use — create the tab with its headers and return empty.
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab.title, gridProperties: { rowCount: 1000, columnCount: tab.autoCreate.length } } } }] }),
        });
        await sheetAppend(token, tabRange(tab.title), tab.autoCreate);
        out = { headers: tab.autoCreate, rows: [] };
      }
      return res.json({ ...out, writable: tab.writable });
    } catch (err) {
      console.error('Tab read error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const token = await getToken();
    const [nfl, col, hs, app, auto, staffD, decks] = await Promise.all([
      sheetGet(token, 'NFL!A:P'),
      sheetGet(token, 'College!A:Q'),
      sheetGet(token, 'Highschool!A:S'),
      sheetGet(token, 'AppData!A:AZ'),
      sheetGet(token, "'AutoSync'!A:V").catch(() => ({ values: [] })), // pre-migration tolerance
      sheetGet(token, "'Staff'!A:A").catch(() => ({ values: [] })),    // names only — never the password column
      getDecks().catch(() => null),
    ]);
    const staffNames = (staffD.values || []).slice(1).map(r => String(r[0] || '').trim()).filter(Boolean);

    const appMap = {};
    parseRows(app).forEach(r => { const k = (r['name'] || r['Name'] || '').toLowerCase().trim(); if (k) appMap[k] = r; });
    // AutoSync (robot-owned followers + depth) overlays AppData values.
    const autoMap = {};
    parseRows(auto).forEach(r => { const k = (r['name'] || r['Name'] || '').toLowerCase().trim(); if (k) autoMap[k] = r; });
    const lookup = name => {
      const k = (name || '').toLowerCase().trim();
      const base = appMap[k] || {};
      const a = autoMap[k];
      if (!a) return base;
      const merged = { ...base };
      for (const f of ['igFollowers', 'twitterFollowers', 'tiktokFollowers', 'depthRank', 'depthPos', 'espnTeam', 'espnHeight', 'espnWeight', 'espnJersey', 'photo247', 'growth7d', 'growth7dPct', 'growthDays', 'contractTotal', 'contractAav', 'contractYears', 'contractGuaranteed', 'contractUrl']) {
        if (String(a[f] ?? '').trim() !== '') merged[f] = a[f];
      }
      return merged;
    };

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

    return res.json({
      athletes, isAdmin: !configured || admin, authConfigured: configured, publicColumnExists,
      user: authState(req).user,
      // Staff directory (names only) feeds the Lead Agent dropdown in the edit
      // form — internal, so only sent to logged-in company sessions. Decks
      // (Box links + live cover thumbnails) feed the dashboard/Resources cards.
      ...(!configured || admin ? { staff: staffNames, decks: decks || undefined } : {}),
    });
  } catch (err) {
    console.error('Athletes error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
