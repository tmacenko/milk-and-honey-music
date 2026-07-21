// api/refresh-depth.js — daily Ourlads depth-chart sync for the Sports roster.
// Fetches depth charts only for teams/schools we actually have athletes on,
// matches players by normalized name, and writes depthRank (1 = starter) and
// depthPos (Ourlads position label, e.g. "RT", "WR-X") to the AppData tab.
// Missing athletes are never blanked — a failed match just leaves last values.
// Auth: admin cookie OR Bearer/query CRON_SECRET (same contract as
// refresh-socials). Query params: dryRun=1 (no writes, report matches).
const crypto = require('crypto');
const { authState } = require('../lib/auth');

const SHEET_ID = process.env.SPORTS_SHEET_ID;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function b64url(str) { return Buffer.from(str).toString('base64url'); }
async function getToken(scope = 'https://www.googleapis.com/auth/spreadsheets') {
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
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error(`Sheets API error on "${range}": ${data.error.code} ${data.error.message}`);
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
function colLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
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

// ── Ourlads ───────────────────────────────────────────────────────────────────
const NFL_CODES = {
  'arizona cardinals': 'ARZ', 'atlanta falcons': 'ATL', 'baltimore ravens': 'BAL',
  'buffalo bills': 'BUF', 'carolina panthers': 'CAR', 'chicago bears': 'CHI',
  'cincinnati bengals': 'CIN', 'cleveland browns': 'CLE', 'dallas cowboys': 'DAL',
  'denver broncos': 'DEN', 'detroit lions': 'DET', 'green bay packers': 'GB',
  'houston texans': 'HOU', 'indianapolis colts': 'IND', 'jacksonville jaguars': 'JAX',
  'kansas city chiefs': 'KC', 'las vegas raiders': 'LV', 'los angeles chargers': 'LAC',
  'los angeles rams': 'LAR', 'miami dolphins': 'MIA', 'minnesota vikings': 'MIN',
  'new england patriots': 'NE', 'new orleans saints': 'NO', 'new york giants': 'NYG',
  'new york jets': 'NYJ', 'philadelphia eagles': 'PHI', 'pittsburgh steelers': 'PIT',
  'san francisco 49ers': 'SF', 'seattle seahawks': 'SEA', 'tampa bay buccaneers': 'TB',
  'tennessee titans': 'TEN', 'washington commanders': 'WAS',
};
// Sheet school names that don't literally match Ourlads' display names.
const COLLEGE_ALIASES = {
  'usf': 'south florida', 'usc': 'southern california', 'ole miss': 'mississippi',
  'pitt': 'pittsburgh', 'lsu': 'lsu', 'tcu': 'tcu', 'smu': 'smu', 'byu': 'byu',
  'ucf': 'central florida', 'miami': 'miami fl', 'uconn': 'connecticut',
};

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

// Normalized person key: "KELCE, TRAVIS 13/3", "Henry Jr., Chris RS FR" and
// our "Chris Henry Jr" all reduce to the same string. Trailing class tokens
// (FR/SO/JR/SR/GR) are ambiguous with name suffixes, but that's harmless —
// Jr/Sr suffixes are stripped in the final normalize anyway.
function nameKey(raw) {
  let s = String(raw || '').replace(/&[a-z#0-9]+;/gi, ' ').trim();
  // Ourlads appends acquisition/draft codes after names — "13/3", "CF23",
  // "U/Was", "T/SF", "W/KC" — all contain a digit or slash, names never do.
  s = s.replace(/(\s+[^\s]*[\d/][^\s]*)+\s*$/, '');
  // College class/status tokens, possibly stacked ("RS FR", or the "RS" left
  // over after a transfer tag like "RS JR/TR" loses its slash part above).
  s = s.replace(/(\s+(RS|FR|SO|JR|SR|GR|TR|HS)\.?)+\s*$/i, '');
  const parts = s.split(',');
  if (parts.length >= 2) s = `${parts.slice(1).join(' ')} ${parts[0]}`;
  return s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
}

// Parse an Ourlads depth chart page -> { nameKey: { rank, pos } }.
function parseDepthChart(html) {
  const out = {};
  const rows = String(html).split(/<tr[^>]*>/i).slice(1);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 3) continue;
    const pos = cells[0].replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '').trim();
    if (!pos || pos.length > 8) continue;
    let rank = 0;
    for (let i = 1; i + 1 < cells.length; i += 2) {
      const m = cells[i + 1].match(/<a[^>]*>([^<]+)<\/a>/);
      if (!m || !m[1].trim()) continue;
      rank++;
      const k = nameKey(m[1]);
      if (k && !(out[k] && out[k].rank <= rank)) out[k] = { rank, pos };
    }
  }
  return out;
}

// College index -> normalized school name -> depth chart URL.
function parseCollegeIndex(html) {
  const map = {};
  const re = /alt='([^']+)'[^>]*class='nfl-dc-mm-logo'[\s\S]*?href='(depth-chart\.aspx\?s=[^']+)'/g;
  let m;
  while ((m = re.exec(html))) {
    const key = m[1].toLowerCase().replace(/[^a-z ]/g, '').trim();
    map[key] = 'https://www.ourlads.com/ncaa-football-depth-charts/' + m[2].replace(/&amp;/g, '&');
  }
  return map;
}
function collegeUrlFor(map, school) {
  let key = String(school || '').toLowerCase().replace(/\buniversity\b|\bcollege\b/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (map[key]) return map[key];                 // exact Ourlads name first (e.g. "USC")
  if (COLLEGE_ALIASES[key] && map[COLLEGE_ALIASES[key]]) return map[COLLEGE_ALIASES[key]];
  const hit = Object.keys(map).find(k => k === key || k.startsWith(key + ' ') || key.startsWith(k + ' '));
  return hit ? map[hit] : null;
}

async function runTasks(tasks, concurrency, deadline) {
  let i = 0, timedOut = false;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < tasks.length) {
      if (Date.now() > deadline) { timedOut = true; return; }
      const t = tasks[i++];
      try { await t(); } catch { /* per-task errors recorded by task itself */ }
    }
  });
  await Promise.all(workers);
  return timedOut;
}

function authorized(req) {
  const { configured, admin } = authState(req);
  if (!configured || admin) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = String(req.headers['authorization'] || '');
  if (auth === `Bearer ${secret}`) return true;
  return (req.query || {}).key === secret;
}

module.exports = async (req, res) => {
  if (!SHEET_ID) return res.status(500).json({ error: 'SPORTS_SHEET_ID not set' });
  if (!authorized(req)) return res.status(403).json({ error: 'Not authorized' });
  const dryRun = ['1', 'true'].includes(String((req.query || {}).dryRun || ''));
  const deadline = Date.now() + 52000;

  try {
    const token = await getToken();
    const [nfl, col, app] = await Promise.all([
      sheetGet(token, 'NFL!A:P'), sheetGet(token, 'College!A:Q'), sheetGet(token, 'AppData!A:AZ'),
    ]);

    // Ensure AppData has depthRank/depthPos columns (auto-add headers once,
    // expanding the sheet's column grid when the tab is at its current width).
    const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties(columnCount)))`, {
      headers: { Authorization: `Bearer ${token}` } });
    const meta = await metaR.json();
    const appMeta = (meta.sheets || []).find(s => (s.properties?.title || '').trim().toLowerCase() === 'appdata');
    if (!appMeta) throw new Error('AppData tab not found');
    let appGridCols = appMeta.properties?.gridProperties?.columnCount || 0;
    const appGid = appMeta.properties.sheetId;
    const appRows = app.values || [];
    let appHeaders = (appRows[0] || []).map(h => String(h || '').trim());
    const ensureCol = async (name) => {
      let idx = appHeaders.findIndex(h => h.toLowerCase() === name.toLowerCase());
      if (idx >= 0) return idx;
      idx = appHeaders.length;
      if (!dryRun) {
        if (idx >= appGridCols) {
          const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ appendDimension: { sheetId: appGid, dimension: 'COLUMNS', length: idx - appGridCols + 1 } }] }),
          });
          const d = await r.json();
          if (d.error) throw new Error(`Sheets grid expand error: ${d.error.code} ${d.error.message}`);
          appGridCols = idx + 1;
        }
        await sheetBatchUpdate(token, [{ range: `AppData!${colLetter(idx)}1`, values: [[name]] }]);
      }
      appHeaders = [...appHeaders, name];
      return idx;
    };
    const rankCol = await ensureCol('depthRank');
    const posCol = await ensureCol('depthPos');
    const nameCol = appHeaders.findIndex(h => h.toLowerCase() === 'name');
    if (nameCol < 0) throw new Error('AppData needs a name column');
    const appRowByKey = {};
    appRows.forEach((r, i) => { if (i > 0) { const k = nameKey(r[nameCol]); if (k) appRowByKey[k] = i + 1; } });

    // Group athletes by team page to fetch.
    const nflPlayers = parseRows(nfl);
    const colPlayers = parseRows(col);
    const byUrl = {}; // url -> [{ name, key }]
    const unresolvedTeams = new Set();
    for (const p of nflPlayers) {
      const team = String(p['Team'] || '').toLowerCase().trim();
      const code = NFL_CODES[team];
      if (!code) { if (team) unresolvedTeams.add(p['Team']); continue; }
      const url = `https://www.ourlads.com/nfldepthcharts/depthchart/${code}`;
      (byUrl[url] = byUrl[url] || []).push({ name: p['Name'], key: nameKey(p['Name']) });
    }
    let collegeIndex = null;
    if (colPlayers.length) {
      try { collegeIndex = parseCollegeIndex(await fetchText('https://www.ourlads.com/ncaa-football-depth-charts/')); }
      catch (e) { collegeIndex = null; }
    }
    if (collegeIndex) {
      for (const p of colPlayers) {
        const url = collegeUrlFor(collegeIndex, p['School']);
        if (!url) { if (p['School']) unresolvedTeams.add(p['School']); continue; }
        (byUrl[url] = byUrl[url] || []).push({ name: p['Name'], key: nameKey(p['Name']) });
      }
    }

    // Fetch each depth chart and collect matches.
    const matches = [];   // { name, rank, pos }
    const unmatched = [];
    const fetchErrors = [];
    const tasks = Object.entries(byUrl).map(([url, players]) => async () => {
      try {
        const chart = parseDepthChart(await fetchText(url));
        for (const p of players) {
          const hit = chart[p.key];
          if (hit) matches.push({ name: p.name, rank: hit.rank, pos: hit.pos });
          else unmatched.push(p.name);
        }
      } catch (e) {
        fetchErrors.push(`${url}: ${e.message}`);
      }
    });
    const timedOut = await runTasks(tasks, 6, deadline);

    // Write back to AppData (matched athletes only — never blanks).
    let cellsWritten = 0;
    if (!dryRun) {
      const updates = [];
      for (const m of matches) {
        const rowNum = appRowByKey[nameKey(m.name)];
        if (!rowNum) continue;
        updates.push({ range: `AppData!${colLetter(rankCol)}${rowNum}`, values: [[String(m.rank)]] });
        updates.push({ range: `AppData!${colLetter(posCol)}${rowNum}`, values: [[m.pos]] });
      }
      // Batch in chunks to stay under request-size limits.
      for (let i = 0; i < updates.length; i += 100) await sheetBatchUpdate(token, updates.slice(i, i + 100));
      cellsWritten = updates.length;
    }

    return res.json({
      success: true, dryRun, timedOut,
      teamsFetched: Object.keys(byUrl).length,
      matched: matches.length, unmatchedCount: unmatched.length,
      cellsWritten,
      unmatched: unmatched.slice(0, 40),
      unresolvedTeams: [...unresolvedTeams].slice(0, 20),
      fetchErrors: fetchErrors.slice(0, 10),
      sample: matches.slice(0, 12),
    });
  } catch (err) {
    console.error('Depth refresh error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Exposed for tests only.
module.exports._test = { nameKey, parseDepthChart, parseCollegeIndex, collegeUrlFor };
