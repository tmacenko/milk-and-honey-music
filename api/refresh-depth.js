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

// Residential proxy (optional, PROXY_URL) — 247sports blocks datacenter IPs
// with 406s, same as Instagram; Ourlads and ESPN don't need it.
let proxyDispatcher = null, proxyFetch = null;
if (process.env.PROXY_URL) {
  // Use undici's own fetch with its ProxyAgent — Node's built-in fetch can
  // reject dispatchers from a separately-installed undici.
  try { const u = require('undici'); proxyDispatcher = new u.ProxyAgent(process.env.PROXY_URL); proxyFetch = u.fetch; } catch { /* undici unavailable */ }
}
const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};
async function fetchText(url, viaProxy = false) {
  const opts = { headers: BROWSER_HEADERS, redirect: 'follow' };
  const useProxy = viaProxy && proxyDispatcher && proxyFetch;
  if (useProxy) opts.dispatcher = proxyDispatcher;
  let r;
  try {
    r = await (useProxy ? proxyFetch : fetch)(url, opts);
  } catch (e) {
    const why = e.cause ? (e.cause.code || e.cause.message || '') : e.message;
    throw new Error(`fetch failed (${why}) for ${url}`);
  }
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

// Spotrac team contracts page → nameKey → {total, aav, gtd, years}.
// Rows live in server-rendered tables; the active-contracts table comes first,
// so the first row seen for a player wins.
function parseSpotracContracts(html) {
  const out = {};
  for (const rm of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = rm[1];
    const am = row.match(/<a[^>]*href=["']([^"']*(?:redirect\/player|\/player\/_\/id\/)[^"']*)["'][^>]*>([^<]+)<\/a>/);
    if (!am) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    // Layout: name,pos,startYear,type,ageAtSigning,startYear,endYear,yrs,value,avg,gtdAtSign,practicalGtd
    if (cells.length < 12 || !/^\$/.test(cells[8])) continue;
    const k = nameKey(am[2]);
    if (out[k]) continue;
    const gtd = cells[11] && cells[11] !== '-' ? cells[11] : (cells[10] !== '-' ? cells[10] : '');
    out[k] = {
      url: /^https?:/i.test(am[1]) ? am[1] : `https://www.spotrac.com${am[1].startsWith('/') ? '' : '/'}${am[1]}`,
      total: cells[8], aav: cells[9], gtd,
      years: /^\d{4}$/.test(cells[5]) && /^\d{4}$/.test(cells[6]) ? `${cells[5]}–${cells[6]}` : '',
      // Raw display name, kept for the surname fallback when exact keys miss
      // (our "Kam Curl" vs Spotrac's "Kamren Curl").
      raw: am[2].replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  return out;
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
  // task=depth|espn|hs|contracts|recruits|coaches|all — the daily cron runs everything.
  const task = String((req.query || {}).task || 'all');
  const wants = (t) => task === 'all' || task === t;
  const deadline = Date.now() + 52000;

  try {
    const token = await getToken();
    const [nfl, col, hs, app, auto] = await Promise.all([
      sheetGet(token, 'NFL!A:P'), sheetGet(token, 'College!A:Q'), sheetGet(token, 'Highschool!A:S'),
      sheetGet(token, 'AppData!A:AZ'), sheetGet(token, "'AutoSync'!A:V"),
    ]);

    // Write target is the AutoSync tab (robot-owned; created by the sheet
    // migration). Athletes without a row get one appended below. New columns
    // for the ESPN/247 sync are appended to its header row on first run.
    const autoRows = auto.values || [];
    let autoHeaders = (autoRows[0] || []).map(h => String(h || '').trim());
    const AUTO_EXTRA = ['espnTeam', 'espnHeight', 'espnWeight', 'espnJersey', 'photo247', 'contractTotal', 'contractAav', 'contractYears', 'contractGuaranteed', 'contractUrl', 'positionCoach'];
    const missingAuto = AUTO_EXTRA.filter(h => !autoHeaders.some(x => x.toLowerCase() === h.toLowerCase()));
    if (missingAuto.length && !dryRun) {
      // Widen the grid first if the tab is at its column limit.
      const metaR0 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties(columnCount)))`, { headers: { Authorization: `Bearer ${token}` } });
      const meta0 = await metaR0.json();
      const asMeta0 = (meta0.sheets || []).find(s => (s.properties?.title || '').trim() === 'AutoSync');
      const width0 = asMeta0?.properties?.gridProperties?.columnCount || autoHeaders.length;
      if (asMeta0 && autoHeaders.length + missingAuto.length > width0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ appendDimension: { sheetId: asMeta0.properties.sheetId, dimension: 'COLUMNS', length: autoHeaders.length + missingAuto.length - width0 } }] }),
        });
      }
      await sheetBatchUpdate(token, [{ range: `'AutoSync'!${colLetter(autoHeaders.length)}1`, values: [missingAuto] }]);
      autoHeaders = [...autoHeaders, ...missingAuto];
    }
    const autoIdx = n => autoHeaders.findIndex(h => h.toLowerCase() === n.toLowerCase());
    const nameCol = autoIdx('name'), rankCol = autoIdx('depthRank'), posCol = autoIdx('depthPos');
    if (nameCol < 0 || rankCol < 0 || posCol < 0) throw new Error('AutoSync needs name/depthRank/depthPos columns');
    const appRowByKey = {};
    autoRows.forEach((r, i) => { if (i > 0) { const k = nameKey(r[nameCol]); if (k) appRowByKey[k] = i + 1; } });
    let autoRowCount = autoRows.length;
    const ensureAutoRow = async (name) => {
      const k = nameKey(name);
      if (appRowByKey[k]) return appRowByKey[k];
      if (dryRun) return 0;
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'AutoSync'!A:V")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [autoHeaders.map((_, j) => j === nameCol ? name : '')] }),
      });
      autoRowCount += 1;
      appRowByKey[k] = autoRowCount;
      return autoRowCount;
    };

    // AppData lookups (espnId store, 247 profile links) + ensure the
    // teamOverride column exists for the trade-grace-period override.
    const appRows = app.values || [];
    let appHeaders = (appRows[0] || []).map(h => String(h || '').trim());
    // Manual-override columns the edit form writes to — ensure they exist.
    // highSchool is robot-filled from 247 (pipeline tracking; no UI yet).
    for (const needCol of ['teamOverride', 'contractValue', 'highSchool']) {
    if (!appHeaders.some(h => h.toLowerCase() === needCol.toLowerCase()) && !dryRun) {
      const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties(columnCount)))`, {
        headers: { Authorization: `Bearer ${token}` } });
      const meta = await metaR.json();
      const appMeta = (meta.sheets || []).find(s => (s.properties?.title || '').trim().toLowerCase() === 'appdata');
      if (appMeta) {
        const width = appMeta.properties?.gridProperties?.columnCount || appHeaders.length;
        if (appHeaders.length >= width) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ appendDimension: { sheetId: appMeta.properties.sheetId, dimension: 'COLUMNS', length: appHeaders.length - width + 1 } }] }),
          });
        }
        await sheetBatchUpdate(token, [{ range: `AppData!${colLetter(appHeaders.length)}1`, values: [[needCol]] }]);
        appHeaders = [...appHeaders, needCol];
      }
    }
    }
    const appIdx = n => appHeaders.findIndex(h => h.toLowerCase() === n.toLowerCase());
    const appNameCol = appIdx('name'), espnIdCol = appIdx('espnId'), url247Col = appIdx('profileUrl247');
    const appByKey = {};
    appRows.forEach((r, i) => { if (i > 0 && appNameCol >= 0) { const k = nameKey(r[appNameCol]); if (k) appByKey[k] = { row: i + 1, cells: r }; } });
    let appRowTotal = appRows.length; // last occupied AppData row (1-based, incl. header)

    // ?name= targets a single athlete (the just-onboarded flow) — enrich only
    // them, and skip the daily history snapshots so the nightly full run's
    // per-day dedupe isn't poisoned by a partial day.
    const onlyName = String((req.query || {}).name || '').trim().toLowerCase();
    const byOnly = (rows2) => onlyName ? rows2.filter(p => String(p['Name'] || '').trim().toLowerCase() === onlyName) : rows2;
    const nflPlayers = byOnly(parseRows(nfl));
    const colPlayers = byOnly(parseRows(col));
    const hsPlayers = byOnly(parseRows(hs));

    // ── Module 1: Ourlads depth charts ────────────────────────────────────────
    const byUrl = {}; // url -> [{ name, key }]
    const unresolvedTeams = new Set();
    const matches = [];   // { name, rank, pos }
    const unmatched = [];
    const fetchErrors = [];
    let timedOut = false;
    let cellsWritten = 0;
    if (wants('depth')) {
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
    timedOut = await runTasks(tasks, 6, deadline);

    // Write back to AutoSync (matched athletes only — never blanks).
    if (!dryRun) {
      const updates = [];
      for (const m of matches) {
        const rowNum = await ensureAutoRow(m.name);
        if (!rowNum) continue;
        updates.push({ range: `'AutoSync'!${colLetter(rankCol)}${rowNum}`, values: [[String(m.rank)]] });
        updates.push({ range: `'AutoSync'!${colLetter(posCol)}${rowNum}`, values: [[m.pos]] });
      }
      // Batch in chunks to stay under request-size limits.
      for (let i = 0; i < updates.length; i += 100) await sheetBatchUpdate(token, updates.slice(i, i + 100));
      cellsWritten = updates.length;
    }
    } // end depth module

    // ── Module 2: ESPN details (NFL + College) ───────────────────────────────
    // Pulls current team / height / weight / jersey into AutoSync for anyone
    // with an espnId, and discovers missing espnIds by name search (written to
    // AppData's espnId column). Manual values in AppData always win at display
    // time, and AppData's teamOverride beats the synced team entirely.
    const espn = { updated: 0, idsFound: 0, errors: [] };
    if (wants('espn')) {
      const espnTeamCol = autoIdx('espnTeam'), espnHCol = autoIdx('espnHeight'),
        espnWCol = autoIdx('espnWeight'), espnJCol = autoIdx('espnJersey');
      const targets = [
        ...nflPlayers.map(p => ({ name: p['Name'], league: 'nfl' })),
        ...colPlayers.map(p => ({ name: p['Name'], league: 'college-football' })),
      ].filter(t => t.name);
      // Discover missing espnIds (bounded per run to stay in budget).
      const espnUpdates = [];
      let lookups = 0;
      const espnTasks = targets.map(t => async () => {
        const rec = appByKey[nameKey(t.name)];
        let id = rec && espnIdCol >= 0 ? String(rec.cells[espnIdCol] || '').trim() : '';
        if (!id && rec && lookups < 40) {
          lookups++;
          try {
            const sr = await (await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(t.name)}&limit=10`, { headers: { 'User-Agent': UA } })).json();
            const wantLeague = t.league === 'nfl' ? 'NFL' : 'NCAAF';
            for (const g of sr.results || []) {
              if (g.type !== 'player') continue;
              for (const it of g.contents || []) {
                if (String(it.description || '').toUpperCase() !== wantLeague) continue;
                if (nameKey(it.displayName) !== nameKey(t.name)) continue;
                const m = String(it.uid || '').match(/a:(\d+)/) || String((it.link || {}).web || '').match(/\/id\/(\d+)/);
                if (m) { id = m[1]; break; }
              }
              if (id) break;
            }
          } catch (e) { espn.errors.push(`search ${t.name}: ${e.message}`); }
          if (id && !dryRun && espnIdCol >= 0) {
            await sheetBatchUpdate(token, [{ range: `AppData!${colLetter(espnIdCol)}${rec.row}`, values: [[id]] }]);
            espn.idsFound++;
          }
        }
        if (!id) return;
        try {
          const d = await (await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/${t.league}/athletes/${id}`, { headers: { 'User-Agent': UA } })).json();
          const a = d.athlete || d;
          if (!a || !a.displayName) return;
          const teamObj = a.team || {};
          let teamVal = t.league === 'nfl' ? (teamObj.displayName || '') : (teamObj.location || '');
          // ESPN keeps a released player's LAST team on the record and flags the
          // truth in the status field — mirror that so we don't show a stale club.
          const stType = String((a.status || {}).type || (a.status || {}).name || '').toLowerCase().replace(/\s+/g, '-');
          if (t.league === 'nfl' && stType === 'free-agent') teamVal = 'Free Agent';
          if (t.league === 'nfl' && stType === 'retired') teamVal = 'Retired';
          const height = String(a.displayHeight || '').replace(/\s+/g, '');
          const weight = String(a.displayWeight || '').replace(/\s*lbs.*$/i, '');
          const jersey = String(a.jersey || '');
          const rowNum = await ensureAutoRow(t.name);
          if (!rowNum) return;
          const put = (colI, v) => { if (colI >= 0 && String(v).trim()) espnUpdates.push({ range: `'AutoSync'!${colLetter(colI)}${rowNum}`, values: [[String(v)]] }); };
          put(espnTeamCol, teamVal); put(espnHCol, height); put(espnWCol, weight); put(espnJCol, jersey);
          espn.updated++;
        } catch (e) { espn.errors.push(`${t.name}: ${e.message}`); }
      });
      await runTasks(espnTasks, 8, deadline);
      if (!dryRun) for (let i = 0; i < espnUpdates.length; i += 100) await sheetBatchUpdate(token, espnUpdates.slice(i, i + 100));
    }

    // ── Module 3: 247 profile photos (High School) ───────────────────────────
    // The headshot is the last .jpg lazy-image before the profile <h1>.
    const hs247 = { images: 0, errors: [], discovery: { found: 0, ambiguous: [], misses: [], errors: [] }, enrich: { updated: 0, cells: 0, errors: [] }, rank: { captured: 0, errors: [] } };
    // Daily 247 rating/rank per linked HS kid — merged with depth ranks into
    // the StatHistory snapshot at the end of the run.
    const rankTrend = {};
    if (wants('hs')) {
      const photoCol = autoIdx('photo247');

      // 3a: URL auto-discovery. For HS athletes with no saved 247 link, query the
      // season Recruits JSON (contains-match on name, ≤50 results) and accept a
      // link only when exactly one result matches BOTH the athlete's name and
      // school; anything else stays manual and is flagged in the job report.
      const disc = hs247.discovery;
      const schoolKey = s => String(s || '').toLowerCase()
        .replace(/\bsaint\b/g, 'st').replace(/\bmount\b/g, 'mt').replace(/\bfort\b/g, 'ft')
        .replace(/\b(high school|hs|senior|academy|prep|preparatory|school)\b/g, '')
        .replace(/[^a-z]/g, '');
      const needUrl = hsPlayers.filter(p => {
        const rec = appByKey[nameKey(p['Name'])];
        const url = rec && url247Col >= 0 ? String(rec.cells[url247Col] || '').trim() : '';
        return p['Name'] && !url;
      });
      let discLookups = 0;
      const discTasks = needUrl.map(p => async () => {
        if (discLookups >= 15) return; // bounded per run; the nightly cron drains the backlog
        discLookups++;
        const cls = parseInt(String(p['ClassOf'] || '').replace(/\D/g, ''), 10);
        const now = new Date().getUTCFullYear();
        const years = cls ? [cls] : [now, now + 1, now + 2, now + 3];
        const cands = [];
        for (const y of years) {
          try {
            const body = await fetchText(`https://247sports.com/Season/${y}-Football/Recruits.json?Player.FullName=${encodeURIComponent(p['Name'])}`, true);
            for (const r of JSON.parse(body) || []) {
              const pl = r.Player || {};
              if (nameKey(pl.FullName) !== nameKey(p['Name'])) continue;
              cands.push({ url: String(pl.Url || ''), school: (pl.PlayerHighSchool || {}).Name || '' });
            }
          } catch (e) { disc.errors.push(`${p['Name']} (${y}): ${e.message}`); }
        }
        const sk = schoolKey(p['School']);
        const hits = cands.filter(c => { const ck = schoolKey(c.school); return sk && ck && (sk.includes(ck) || ck.includes(sk)); });
        const uniq = [...new Set(hits.map(h => h.url).filter(Boolean))];
        if (uniq.length === 1) {
          let rec = appByKey[nameKey(p['Name'])];
          if (!rec && appNameCol >= 0 && url247Col >= 0 && !dryRun) {
            // No AppData row yet (new athlete, or the sheet name was corrected
            // after the row was created) — append one with just name + link.
            const newRow = appHeaders.map((_, j) => j === appNameCol ? p['Name'] : (j === url247Col ? uniq[0] : ''));
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('AppData!A:AZ')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
              method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ values: [newRow] }),
            });
            appRowTotal += 1;
            rec = appByKey[nameKey(p['Name'])] = { row: appRowTotal, cells: newRow };
            disc.found++;
          } else if (rec && url247Col >= 0) {
            if (!dryRun) await sheetBatchUpdate(token, [{ range: `AppData!${colLetter(url247Col)}${rec.row}`, values: [[uniq[0]]] }]);
            rec.cells[url247Col] = uniq[0]; // photo pass below picks it up this same run
            disc.found++;
          } else disc.errors.push(`${p['Name']}: no AppData row`);
        } else if (cands.length) {
          disc.ambiguous.push({ name: p['Name'], school: p['School'] || '', candidates: [...new Set(cands.map(c => `${c.school || '?'} — ${c.url}`))].slice(0, 4) });
        } else {
          disc.misses.push(p['Name']);
        }
      });
      await runTasks(discTasks, 3, deadline);

      // 3b: profile enrichment. Any HS athlete with a 247 link gets blank-only
      // backfill from the same season Recruits JSON: height/weight/hometown into
      // AppData, ClassOf/School into the Highschool tab. Candidates are matched
      // by their exact saved profile URL, and onboarding/manual data always
      // wins — only empty cells are written.
      const enrich = hs247.enrich;
      const STATE_ABBR = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC' };
      const hsHeaders = (hs.values?.[0] || []).map(h => String(h || '').trim());
      const hsCol = n => hsHeaders.findIndex(h => h.toLowerCase() === n.toLowerCase());
      const classCol = hsCol('ClassOf') >= 0 ? hsCol('ClassOf') : hsCol('Class Of');
      const schoolCol = hsCol('School');
      const appHCol = appIdx('height'), appWCol = appIdx('weight'), appHomeCol = appIdx('hometown');
      const urlKey = u => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').split('?')[0];
      // 247 sometimes renames profile slugs (aj-lopez → aj-lopez-jr) but the
      // trailing player number is stable — prefer it for matching.
      const playerIdOf = u => (urlKey(u).match(/-(\d+)$/) || [])[1] || '';
      const sameProfile = (a, b) => { const ia = playerIdOf(a), ib = playerIdOf(b); return ia && ib ? ia === ib : urlKey(a) === urlKey(b); };
      // Record a kid's current 247 rating/ranks for the StatHistory snapshot —
      // rank-riser tracking needs history from the day we start collecting it.
      const recordRank = (name, pl) => {
        rankTrend[nameKey(name)] = {
          name, rating247: pl.Rating ?? '', stars247: pl.StarRating ?? '',
          natRank247: pl.NationalRank ?? '', posRank247: pl.PositionRank ?? '', stateRank247: pl.StateRank ?? '',
        };
      };
      // Find an athlete's row in the season Recruits JSON by their saved URL.
      // Starts with the sheet's class year but falls back to the rest (the two
      // sources occasionally disagree); the name filter is a contains-match, so
      // suffixed names and sheet typos fall back to the URL-slug-derived name —
      // the URL comparison keeps every variant exact.
      const findRecruit = async (p, url, errSink) => {
        const cls = parseInt(String(p[hsHeaders[classCol]] || '').replace(/\D/g, ''), 10);
        const now = new Date().getUTCFullYear();
        const yearPool = [now, now + 1, now + 2, now + 3];
        const years = cls ? [cls, ...yearPool.filter(y => y !== cls)] : yearPool;
        const stripSuffix = s => String(s || '').replace(/[,.]/g, ' ').replace(/\s+(jr|sr|ii|iii|iv|v)\s*$/i, '').replace(/\s+/g, ' ').trim();
        const slugM = url.match(/\/player\/([a-z0-9-]+?)(?:-\d+)?\/?$/i);
        const queries = [...new Set([p['Name'], stripSuffix(p['Name']), slugM ? slugM[1].replace(/-/g, ' ') : ''].filter(Boolean))];
        for (const q of queries) {
          for (const y of years) {
            try {
              const body = await fetchText(`https://247sports.com/Season/${y}-Football/Recruits.json?Player.FullName=${encodeURIComponent(q)}`, true);
              for (const r of JSON.parse(body) || []) {
                const pl = r.Player || {};
                if (sameProfile(pl.Url, url)) return { hit: pl, hitYear: r.Year || y };
              }
            } catch (e) { errSink.push(`${p['Name']} (${y}): ${e.message}`); }
          }
        }
        return null;
      };
      let enrichLookups = 0;
      const enrichTasks = hsPlayers.map(p => async () => {
        const rec = appByKey[nameKey(p['Name'])];
        const url = rec && url247Col >= 0 ? String(rec.cells[url247Col] || '').trim() : '';
        if (!url || !/247sports\.com/.test(url)) return;
        const needH = appHCol >= 0 && !String(rec.cells[appHCol] || '').trim();
        const needW = appWCol >= 0 && !String(rec.cells[appWCol] || '').trim();
        const needHome = appHomeCol >= 0 && !String(rec.cells[appHomeCol] || '').trim();
        const needClass = classCol >= 0 && !String(p[hsHeaders[classCol]] || '').trim();
        const needSchool = schoolCol >= 0 && !String(p['School'] || '').trim();
        if (!(needH || needW || needHome || needClass || needSchool)) return;
        if (enrichLookups >= 20) return;
        enrichLookups++;
        const found = await findRecruit(p, url, enrich.errors);
        if (!found) { enrich.errors.push(`${p['Name']}: no 247 row matched saved link`); return; }
        const { hit, hitYear } = found;
        recordRank(p['Name'], hit);
        const ups = [];
        const hm = String(hit.Height || '').match(/^(\d+)-(\d+(?:\.\d+)?)$/);
        if (needH && hm) ups.push({ range: `AppData!${colLetter(appHCol)}${rec.row}`, values: [[`${hm[1]}'${Math.round(parseFloat(hm[2]))}"`]] });
        if (needW && hit.Weight) ups.push({ range: `AppData!${colLetter(appWCol)}${rec.row}`, values: [[String(Math.round(hit.Weight))]] });
        const town = hit.Hometown || {};
        if (needHome && town.City) {
          const st = STATE_ABBR[String(town.State || '').toLowerCase()] || town.State || '';
          ups.push({ range: `AppData!${colLetter(appHomeCol)}${rec.row}`, values: [[st ? `${town.City}, ${st}` : town.City]] });
        }
        if (needClass && hitYear) ups.push({ range: `Highschool!${colLetter(classCol)}${p._rowIndex}`, values: [[String(hitYear)]] });
        if (needSchool && (hit.PlayerHighSchool || {}).Name) ups.push({ range: `Highschool!${colLetter(schoolCol)}${p._rowIndex}`, values: [[hit.PlayerHighSchool.Name]] });
        if (ups.length) {
          if (!dryRun) await sheetBatchUpdate(token, ups);
          enrich.updated++; enrich.cells += ups.length;
        }
      });
      await runTasks(enrichTasks, 3, deadline);

      // 3c: rank snapshot for the remaining linked HS kids — enrichment only
      // fetched the ones with blank profile fields; the risers history wants
      // everyone's current rating/rank daily.
      let rankLookups = 0;
      const rankTasks = hsPlayers.map(p => async () => {
        const rec = appByKey[nameKey(p['Name'])];
        const url = rec && url247Col >= 0 ? String(rec.cells[url247Col] || '').trim() : '';
        if (!url || !/247sports\.com/.test(url)) return;
        if (rankTrend[nameKey(p['Name'])]) return; // covered via enrichment
        if (rankLookups >= 30) return;
        rankLookups++;
        const found = await findRecruit(p, url, hs247.rank.errors);
        if (found) recordRank(p['Name'], found.hit);
      });
      await runTasks(rankTasks, 3, deadline);
      hs247.rank.captured = Object.keys(rankTrend).length;
      const hsTargets = hsPlayers.map(p => {
        const rec = appByKey[nameKey(p['Name'])];
        const url = rec && url247Col >= 0 ? String(rec.cells[url247Col] || '').trim() : '';
        return url && /247sports\.com/.test(url) ? { name: p['Name'], url } : null;
      }).filter(Boolean);
      const hsUpdates = [];
      const hsTasks = hsTargets.map(t => async () => {
        try {
          const html = await fetchText(t.url, true); // 247 needs the residential proxy
          const h1 = html.search(/<h1[^>]*>/i);
          const head = h1 > 0 ? html.slice(0, h1) : html;
          const imgs = [...head.matchAll(/data-src="(https:\/\/s3media\.247sports\.com\/Uploads\/Assets\/[^"]+?\.jpe?g)[^"]*"/gi)];
          if (!imgs.length) return;
          const url = imgs[imgs.length - 1][1].replace(/&amp;/g, '&') + '?width=400';
          const rowNum = await ensureAutoRow(t.name);
          if (!rowNum || photoCol < 0) return;
          hsUpdates.push({ range: `'AutoSync'!${colLetter(photoCol)}${rowNum}`, values: [[url]] });
          hs247.images++;
        } catch (e) { hs247.errors.push(`${t.name}: ${e.message}`); }
      });
      await runTasks(hsTasks, 5, deadline);
      if (!dryRun) await sheetBatchUpdate(token, hsUpdates);
    }

    // ── Module 4: Spotrac contracts (NFL) ────────────────────────────────────
    // One server-rendered contracts table per team; we fetch only teams we have
    // players on, rotating the order daily so the runtime deadline never starves
    // the same teams. Manual AppData values win at display time.
    const contracts = { teams: 0, matched: 0, errors: [] };
    if (wants('contracts') || task === 'all') {
      const cTotCol = autoIdx('contractTotal'), cAavCol = autoIdx('contractAav'),
        cYrsCol = autoIdx('contractYears'), cGtdCol = autoIdx('contractGuaranteed'), cUrlCol = autoIdx('contractUrl');
      const teamSlug = t => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
      const byTeam = {};
      for (const p of nflPlayers) {
        const team = String(p['Team'] || '').trim();
        if (!team || /free agent|retired|inactive|cfl|ufl|xfl/i.test(team)) continue; // Spotrac covers NFL only
        (byTeam[teamSlug(team)] = byTeam[teamSlug(team)] || []).push(p);
      }
      let cTeams = Object.keys(byTeam).sort();
      const rot = Math.floor(Date.now() / 86400000) % Math.max(1, cTeams.length);
      cTeams = [...cTeams.slice(rot), ...cTeams.slice(0, rot)];
      const cUpdates = [];
      const cTasks = cTeams.map(sl => async () => {
        try {
          const url = `https://www.spotrac.com/nfl/${sl}/contracts`;
          let html;
          try { html = await fetchText(url); }
          catch { html = await fetchText(url, true); } // datacenter-blocked → proxy
          const table = parseSpotracContracts(html);
          contracts.teams++;
          for (const p of byTeam[sl]) {
            let hit = table[nameKey(p['Name'])];
            // Nickname tolerance: Spotrac uses formal first names ("Kamren
            // Curl", "Michael Hall Jr.") where the sheet may have the common
            // form. Fall back to surname + first initial, but only when
            // exactly ONE player on this team's table qualifies — ambiguity
            // means we write nothing rather than risk the wrong contract.
            if (!hit) {
              const toks = (n) => String(n).toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
                .replace(/[^a-z ]/g, '').trim().split(/\s+/).filter(Boolean);
              const pt = toks(p['Name']);
              if (pt.length >= 2) {
                const cands = Object.values(table).filter(e => {
                  const et = toks(e.raw || '');
                  return et.length >= 2 && et[et.length - 1] === pt[pt.length - 1] && et[0][0] === pt[0][0];
                });
                if (cands.length === 1) { hit = cands[0]; contracts.fuzzyMatched = (contracts.fuzzyMatched || 0) + 1; }
              }
            }
            if (!hit) continue;
            const rowNum = await ensureAutoRow(p['Name']);
            if (!rowNum) continue;
            const put = (ci, v) => { if (ci >= 0 && String(v ?? '').trim()) cUpdates.push({ range: `'AutoSync'!${colLetter(ci)}${rowNum}`, values: [[String(v)]] }); };
            put(cTotCol, hit.total); put(cAavCol, hit.aav); put(cYrsCol, hit.years); put(cGtdCol, hit.gtd); put(cUrlCol, hit.url);
            contracts.matched++;
          }
        } catch (e) { contracts.errors.push(`${sl}: ${e.message}`); }
      });
      await runTasks(cTasks, 3, deadline);
      if (!dryRun) for (let i = 0; i < cUpdates.length; i += 100) await sheetBatchUpdate(token, cUpdates.slice(i, i + 100));
    }

    // ── Module 5: Recruiting board sync ──────────────────────────────────────
    // Keeps 'Recruiting Info' rows fresh from their linked sources: college
    // recruits from ESPN (school/class/position/photo), high schoolers from
    // 247 (class/rating/position/photo). Unlinked rows get bounded
    // auto-discovery (unique name(+school) match only) so the pre-existing
    // board backfills itself across nightly runs. Ranking for college rows is
    // never touched (that's their HS pedigree, not a live stat).
    const recruits = { linked: 0, refreshed: 0, discovered: 0, ambiguous: [], errors: [] };
    if (wants('recruits') && !onlyName) { // board-wide only; single-athlete onboard runs skip it
      try {
        const rec = await sheetGet(token, "'Recruiting Info'!A:Z");
        const recRows = rec.values || [];
        let recHeaders = (recRows[0] || []).map(h => String(h || '').trim());
        // Link/photo columns may predate this module — append them if missing.
        const REC_EXTRA = ['EspnId', 'Url247', 'Photo'].filter(c => !recHeaders.some(h => h.toLowerCase() === c.toLowerCase()));
        if (REC_EXTRA.length && !dryRun) {
          const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties(columnCount)))`, { headers: { Authorization: `Bearer ${token}` } });
          const meta = await metaR.json();
          const rMeta = (meta.sheets || []).find(s => (s.properties?.title || '').trim().toLowerCase() === 'recruiting info');
          if (rMeta) {
            const width = rMeta.properties?.gridProperties?.columnCount || recHeaders.length;
            if (recHeaders.length + REC_EXTRA.length > width) {
              await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests: [{ appendDimension: { sheetId: rMeta.properties.sheetId, dimension: 'COLUMNS', length: recHeaders.length + REC_EXTRA.length - width } }] }),
              });
            }
            await sheetBatchUpdate(token, [{ range: `'Recruiting Info'!${colLetter(recHeaders.length)}1`, values: [REC_EXTRA] }]);
            recHeaders = [...recHeaders, ...REC_EXTRA];
          }
        }
        const rIdx = (re) => recHeaders.findIndex(h => re.test(h));
        const rNameC = rIdx(/player\s*name|^name/i), rSchoolC = rIdx(/school/i), rLevelC = rIdx(/^level/i),
          rPosC = rIdx(/position/i), rRankC = rIdx(/rank/i), rClassC = rIdx(/class|year/i),
          rEspnC = rIdx(/^espnid/i), r247C = rIdx(/^url247/i), rPhotoC = rIdx(/^photo/i);
        const cellAt = (row, c) => c >= 0 ? String(row[c] || '').trim() : '';
        const schoolKey2 = s => String(s || '').toLowerCase()
          .replace(/\bsaint\b/g, 'st').replace(/\bmount\b/g, 'mt').replace(/\bfort\b/g, 'ft')
          .replace(/\b(high school|hs|senior|academy|prep|preparatory|school|university|college|state)\b/g, '')
          .replace(/[^a-z]/g, '');
        const items = recRows.map((row, i) => ({ row, num: i + 1 })).filter(x => x.num > 1 && cellAt(x.row, rNameC));
        const rUpdates = [];
        const putRec = (c, num, v) => { if (c >= 0 && String(v ?? '').trim()) rUpdates.push({ range: `'Recruiting Info'!${colLetter(c)}${num}`, values: [[String(v)]] }); };
        // ?maxdisc= raises the per-run discovery caps for manual backlog drains.
        const discCap = parseInt((req.query || {}).maxdisc, 10) || 0;
        const discCapC = discCap || 10, discCapH = discCap || 8;
        let discCollege = 0, discHs = 0, hsRefresh = 0;
        // Rotate row order daily so bounded lookups drain the whole board.
        const rotR = items.length ? Math.floor(Date.now() / 86400000) % items.length : 0;
        const ordered = [...items.slice(rotR), ...items.slice(0, rotR)];
        const recTasks = ordered.map(({ row, num }) => async () => {
          const name = cellAt(row, rNameC);
          const level = cellAt(row, rLevelC);
          const isCollege = /college/i.test(level);
          let espnId = cellAt(row, rEspnC), url247 = cellAt(row, r247C);
          try {
            if (isCollege) {
              // Discover a missing ESPN link (unique NCAAF name match; school
              // used to break ties, ambiguity means we leave it manual).
              if (!espnId && discCollege < discCapC) {
                discCollege++;
                const sr = JSON.parse(await fetchText(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=10`));
                const hits = [];
                for (const g of sr.results || []) {
                  if (g.type !== 'player') continue;
                  for (const it of g.contents || []) {
                    if (String(it.description || '').toUpperCase() !== 'NCAAF') continue;
                    if (nameKey(it.displayName) !== nameKey(name)) continue;
                    const m = String(it.uid || '').match(/a:(\d+)/) || String((it.link || {}).web || '').match(/\/id\/(\d+)/);
                    if (m) hits.push({ id: m[1], team: String(it.subtitle || '') });
                  }
                }
                const sk = schoolKey2(cellAt(row, rSchoolC));
                const schoolHits = sk ? hits.filter(h => { const hk = schoolKey2(h.team); return hk && (hk.includes(sk) || sk.includes(hk)); }) : [];
                const pick = hits.length === 1 ? hits[0] : (schoolHits.length === 1 ? schoolHits[0] : null);
                if (pick) { espnId = pick.id; putRec(rEspnC, num, espnId); recruits.discovered++; }
                else if (hits.length > 1) recruits.ambiguous.push(name);
              }
              if (!espnId) return;
              recruits.linked++;
              const [detail, core] = await Promise.all([
                fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${espnId}`, { headers: { 'User-Agent': UA } }).then(r => r.json()),
                fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/athletes/${espnId}`, { headers: { 'User-Agent': UA } }).then(r => r.json()).catch(() => ({})),
              ]);
              const a = detail.athlete || detail;
              if (!a || !a.displayName) return;
              putRec(rSchoolC, num, (a.team || {}).location || (a.team || {}).displayName || '');
              putRec(rPosC, num, ((a.position || {}).abbreviation || '').toUpperCase());
              putRec(rClassC, num, (core.experience || {}).displayValue || '');
              putRec(rPhotoC, num, (a.headshot || {}).href || '');
              recruits.refreshed++;
            } else {
              // High school: seasons JSON by class year (bounded — 247 rides
              // the proxy and is the slow leg of this module).
              const cls = parseInt(cellAt(row, rClassC).replace(/\D/g, ''), 10);
              const nowY = new Date().getUTCFullYear();
              const years = cls ? [cls] : [nowY, nowY + 1, nowY + 2, nowY + 3];
              if (!url247) {
                if (discHs >= discCapH) return;
                discHs++;
              } else {
                if (hsRefresh >= 20) return;
                hsRefresh++;
              }
              let hit = null, hitYear = 0;
              const cands = [];
              for (const y of years) {
                if (hit) break;
                try {
                  const body = await fetchText(`https://247sports.com/Season/${y}-Football/Recruits.json?Player.FullName=${encodeURIComponent(name)}`, true);
                  for (const r2 of JSON.parse(body) || []) {
                    const pl = r2.Player || {};
                    if (url247) {
                      const pid = u => (String(u || '').match(/-(\d+)\/?$/) || [])[1] || '';
                      if (pid(pl.Url) && pid(pl.Url) === pid(url247)) { hit = pl; hitYear = r2.Year || y; break; }
                    } else if (nameKey(pl.FullName) === nameKey(name)) {
                      cands.push({ pl, year: r2.Year || y });
                    }
                  }
                } catch (e) { recruits.errors.push(`${name} (${y}): ${e.message}`); }
              }
              if (!url247) {
                const sk = schoolKey2(cellAt(row, rSchoolC));
                const matched = sk ? cands.filter(c => { const ck = schoolKey2((c.pl.PlayerHighSchool || {}).Name); return ck && (ck.includes(sk) || sk.includes(ck)); }) : [];
                const uniq = [...new Set((matched.length ? matched : cands).map(c => String(c.pl.Url || '')))].filter(Boolean);
                const pool = matched.length ? matched : cands;
                if (uniq.length === 1) { hit = pool[0].pl; hitYear = pool[0].year; putRec(r247C, num, uniq[0]); recruits.discovered++; }
                else if (cands.length > 1) recruits.ambiguous.push(name);
              }
              if (!hit) return;
              recruits.linked++;
              // A 247 link proves the level — fill it when blank so the row
              // stops straddling both tabs.
              if (!level) putRec(rLevelC, num, 'High School');
              putRec(rClassC, num, hitYear ? String(hitYear) : '');
              putRec(rPosC, num, ((hit.PrimaryPlayerPosition || {}).Abbreviation || '').toUpperCase());
              if (hit.StarRating) putRec(rRankC, num, `${hit.StarRating}-star`);
              if (hit.DefaultAssetUrl) putRec(rPhotoC, num, String(hit.DefaultAssetUrl) + '?width=400');
              if (!cellAt(row, rSchoolC) && (hit.PlayerHighSchool || {}).Name) putRec(rSchoolC, num, hit.PlayerHighSchool.Name);
              recruits.refreshed++;
            }
          } catch (e) { recruits.errors.push(`${name}: ${e.message}`); }
        });
        await runTasks(recTasks, 4, deadline);
        if (!dryRun) for (let i = 0; i < rUpdates.length; i += 100) await sheetBatchUpdate(token, rUpdates.slice(i, i + 100));
        recruits.cells = rUpdates.length;
      } catch (e) { recruits.errors.push(`board: ${e.message}`); }
    }

    // ── Module 6: High-school pipeline backfill (College + NFL) ──────────────
    // Fills AppData.highSchool ("School — City, ST") from 247's season recruit
    // JSON so we can map which high schools our athletes came through. Class
    // years are aimed by birthday (NFL) / a recent-classes window (College);
    // only a UNIQUE name match across the searched years is accepted. Misses
    // and ambiguous names get "Unknown" so nightly runs stop re-searching them
    // (fix by typing the real school over "Unknown" in AppData).
    const pipeline = { checked: 0, found: 0, unknown: 0, ambiguous: [], errors: [] };
    if (wants('highschools') && !onlyName) {
      try {
        const hsColP = appIdx('highSchool'), homeColP = appIdx('hometown');
        if (hsColP < 0) throw new Error('AppData highSchool column missing');
        const capP = parseInt((req.query || {}).maxdisc, 10) || 8;
        const targets = [
          ...colPlayers.map(p => ({ name: p['Name'], kind: 'college' })),
          ...nflPlayers.map(p => ({ name: p['Name'], kind: 'nfl', bday: p['Birthday'] })),
        ].filter(t => {
          const rec = appByKey[nameKey(t.name)];
          return t.name && rec && !String(rec.cells[hsColP] || '').trim();
        });
        const rotP = targets.length ? Math.floor(Date.now() / 86400000) % targets.length : 0;
        const ordered = [...targets.slice(rotP), ...targets.slice(0, rotP)].slice(0, capP);
        const draftColP = appIdx('draftYear');
        const nowY = new Date().getUTCFullYear();
        const pTasks = ordered.map(t => async () => {
          pipeline.checked++;
          const rec = appByKey[nameKey(t.name)];
          let years;
          if (t.kind === 'college') {
            years = [nowY, nowY - 1, nowY - 2, nowY - 3, nowY - 4, nowY - 5];
          } else {
            const by = (String(t.bday || '').match(/(\d{4})/) || [])[1];
            const dy = draftColP >= 0 ? parseInt(String(rec.cells[draftColP] || '').replace(/\D/g, ''), 10) : 0;
            if (by) years = [+by + 18, +by + 19, +by + 17];
            else if (dy) years = [dy - 3, dy - 4, dy - 5];
            else years = [nowY - 4, nowY - 5, nowY - 6, nowY - 7];
          }
          // Scan the whole window before deciding — a same-name player in a
          // different class year must count as ambiguity, not a false match.
          const cands = new Map();
          let fetchFailed = false;
          for (const y of years) {
            if (y < 2000 || y > nowY + 1) continue;
            try {
              const body = await fetchText(`https://247sports.com/Season/${y}-Football/Recruits.json?Player.FullName=${encodeURIComponent(t.name)}`, true);
              for (const r2 of JSON.parse(body) || []) {
                const pl = r2.Player || {};
                if (nameKey(pl.FullName) !== nameKey(t.name)) continue;
                const town = pl.Hometown || {};
                cands.set(String(pl.Url || pl.Key || cands.size), {
                  hs: (pl.PlayerHighSchool || {}).Name || '',
                  town: [town.City, town.State].filter(Boolean).join(', '),
                });
              }
            } catch (e) { pipeline.errors.push(`${t.name} (${y}): ${e.message}`); fetchFailed = true; }
          }
          // Never stamp Unknown off the back of failed fetches — that's a
          // retry-tomorrow situation, not a definitive miss.
          if (fetchFailed && !cands.size) return;
          const put = async (v) => { if (!dryRun) await sheetBatchUpdate(token, [{ range: `AppData!${colLetter(hsColP)}${rec.row}`, values: [[v]] }]); };
          if (cands.size === 1) {
            const c = [...cands.values()][0];
            if (c.hs) {
              await put(c.town ? `${c.hs} — ${c.town}` : c.hs);
              pipeline.found++;
              // Blank-only hometown fill while we're here.
              if (homeColP >= 0 && c.town && !String(rec.cells[homeColP] || '').trim() && !dryRun) {
                await sheetBatchUpdate(token, [{ range: `AppData!${colLetter(homeColP)}${rec.row}`, values: [[c.town]] }]);
              }
              return;
            }
          }
          if (cands.size > 1) pipeline.ambiguous.push(t.name);
          await put('Unknown');
          pipeline.unknown++;
        });
        // Gentle by design: this is a weeks-long backfill, and 247 rate-limits
        // aggressive bursts (403s) — low concurrency keeps the nightly slot safe.
        await runTasks(pTasks, 2, deadline);
      } catch (e) { pipeline.errors.push(e.message); }
    }

    // ── Module 7: Position coaches (Wikipedia team staff) ────────────────────
    // Wikipedia is the one clean source with position-level staff: NFL teams
    // via Template:{Team} staff, college programs via the Personnel/Coaches
    // section of the program article. Full staff per team lands in the hidden
    // TeamStaff tab (one row per team, JSON staff list); each athlete's
    // matched position coach is written to AutoSync.positionCoach. Teams
    // refresh when >5 days old, a few per run — staffs rarely change.
    const coaches = { teams: 0, matched: 0, misses: 0, errors: [] };
    if (wants('coaches') && !onlyName) {
      try {
        const pcCol = autoIdx('positionCoach');
        const TS_HEAD = ['team', 'kind', 'pageTitle', 'staffJson', 'updated'];
        let ts = null;
        try { ts = await sheetGet(token, "'TeamStaff'!A:E"); }
        catch {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'TeamStaff', hidden: true, gridProperties: { rowCount: 300, columnCount: 5 } } } }] }),
          });
          await sheetBatchUpdate(token, [{ range: "'TeamStaff'!A1", values: [TS_HEAD] }]);
          ts = { values: [TS_HEAD] };
        }
        const tsRows = ts.values || [];
        const tsByTeam = {};
        tsRows.forEach((r, i) => { if (i > 0 && r[0]) tsByTeam[String(r[0]).toLowerCase().trim()] = { row: i + 1, cells: r }; });
        let tsLastRow = tsRows.length;

        const wiki = async (params) => {
          const d = JSON.parse(await fetchText('https://en.wikipedia.org/w/api.php?format=json&' + params));
          if (d.error) throw new Error(d.error.info || d.error.code || 'wiki error');
          return d;
        };
        const deWiki = (x) => String(x || '').replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').replace(/''/g, '').replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').trim();
        // NFL templates list "*Role – [[Name]]"; college articles usually list
        // "*[[Name]] – ''Role''" — detect the italic (role) side per line.
        const parseStaffLines = (wt, roleFirstDefault) => {
          const out = [];
          wt.split('\n').forEach(l => {
            const m = l.match(/^\*+\s*(.+?)\s*[–—-]\s*(.+)$/);
            if (!m) return;
            const italic1 = /''/.test(m[1]), italic2 = /''/.test(m[2]);
            const roleFirst = italic1 !== italic2 ? italic1 : roleFirstDefault;
            const role = deWiki(roleFirst ? m[1] : m[2]);
            const name = deWiki(roleFirst ? m[2] : m[1]);
            if (role && name && name.length < 60 && role.length < 90 && !/^vacant/i.test(name)) out.push({ role, name });
          });
          return out;
        };
        // College: Wikipedia's college staff coverage is unreliable, but nearly
        // every athletics site runs Sidearm with a standardized /staff-directory
        // (name anchor followed by a title cell). School → site map below.
        const COLLEGE_SITES = {
          'arizona state': 'thesundevils.com', 'cincinnati': 'gobearcats.com',
          'college of the holy cross': 'goholycross.com', 'holy cross': 'goholycross.com',
          'florida state': 'seminoles.com', 'georgia': 'georgiadogs.com',
          'georgia southern': 'gseagles.com', 'illinois': 'fightingillini.com',
          'indiana': 'iuhoosiers.com', 'kansas': 'kuathletics.com',
          'kennesaw state': 'ksuowls.com', 'kent state': 'kentstatesports.com',
          'miami': 'miamihurricanes.com', 'michigan': 'mgoblue.com',
          'montana state': 'msubobcats.com', 'north carolina': 'goheels.com',
          'northwestern': 'nusports.com', 'notre dame': 'fightingirish.com',
          'ohio state': 'ohiostatebuckeyes.com', 'oklahoma state': 'okstate.com',
          'penn state': 'gopsusports.com', 'pitt': 'pittsburghpanthers.com',
          'pittsburgh': 'pittsburghpanthers.com', 'san diego state': 'goaztecs.com',
          'south carolina': 'gamecocksonline.com', 'syracuse': 'cuse.com',
          'toledo': 'utrockets.com', 'ucla': 'uclabruins.com',
          'uconn': 'uconnhuskies.com', 'unlv': 'unlvrebels.com',
          'usc': 'usctrojans.com', 'vanderbilt': 'vucommodores.com',
          'wake forest': 'godeacs.com', 'washington': 'gohuskies.com',
          'western kentucky': 'wkusports.com', 'western michigan': 'wmubroncos.com',
        };
        const OTHER_SPORTS = /volleyball|basketball|soccer|baseball|softball|hockey|track|swim|golf|tennis|lacrosse|rowing|gymnast|wrestl|cross country|diving|acrobatics|beach|bowling|fencing|rifle|water polo|cheer|spirit|dance/i;
        const FOOTBALL_ROLE = /football|quarterback|running back|wide receiver|tight end|offensive lin|offensive coordinator|defensive lin|defensive coordinator|linebacker|cornerback|safeties|secondary|defensive back|special teams|edge|pass rush|passing game|run game/i;
        // Handles both Sidearm generations: older tables (anchor > name text,
        // role in a later cell ending in "Coach") and newer cards (name inside
        // an <h4>, role in a bare person-details__position div, e.g.
        // "Quarterbacks" with no Coach suffix).
        const parseSidearmStaff = (html) => {
          const out = [];
          const seen = new Set();
          const anchorRe = /staff-directory\/[^"']+["'][^>]*>/g;
          let m;
          while ((m = anchorRe.exec(html))) {
            const win = html.slice(anchorRe.lastIndex, anchorRe.lastIndex + 1100);
            const nm = win.match(/^(?:<!--[^]*?-->|<h\d[^>]*>|<span[^>]*>|\s)*([^<]{2,60})</);
            if (!nm) continue;
            const name = nm[1].replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
            if (!name || /full bio|^bio$|staff directory/i.test(name)) continue;
            let role = '';
            const pm = win.match(/person-details__position[^>]*>(?:\s*<div[^>]*>)?\s*([^<]{2,90})/i);
            if (pm) role = pm[1];
            else { const tm = win.match(/>([^<>]{3,90}?(?:Coach|Coordinator)(?:es|s)?[^<>]{0,40})</i); if (tm) role = tm[1]; }
            role = role.replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
            if (!role || OTHER_SPORTS.test(role) || !FOOTBALL_ROLE.test(role)) continue;
            const k = (name + '|' + role).toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ role, name });
          }
          // Third variant (e.g. Penn State): table rows with the name as the
          // last text inside a __link anchor and the role in a __position cell.
          for (const row of html.split(/<tr[\s>]/)) {
            if (!/member-position__position/.test(row)) continue;
            const nm = row.match(/__link[^"]*"[^>]*>[^]*?([A-Za-z][A-Za-z .'’-]{1,58})\s*<\/a>/);
            const rm = row.match(/__position[^>]*>(?:<!--[^]*?-->|\s|<p[^>]*>)*([^<]{2,90})/);
            if (!nm || !rm) continue;
            const name = nm[1].replace(/\s+/g, ' ').trim();
            const role = rm[1].replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
            if (!name || !role || OTHER_SPORTS.test(role) || !FOOTBALL_ROLE.test(role)) continue;
            const k = (name + '|' + role).toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ role, name });
          }
          return out;
        };
        // WMT-platform fallbacks: (b) server-rendered coach section on the
        // football roster page; (c) WordPress REST — football department →
        // roster posts → per-person fields (content.position holds the title).
        const parseWmtRoster = (html) => {
          const out = [];
          const seen = new Set();
          const re = /roster\/coach\/[^"']+["'][^>]*>([^<]{2,60})<\/a>/g;
          let m;
          while ((m = re.exec(html))) {
            const name = m[1].replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
            const win = html.slice(re.lastIndex, re.lastIndex + 400);
            const pm = win.match(/class="position"[^>]*>([^<]{2,90})</);
            if (!name || !pm) continue;
            const role = pm[1].replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
            const k = (name + '|' + role).toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ role, name });
          }
          return out;
        };
        const wmtRest = async (site) => {
          const dep = JSON.parse(await fetchText(`https://${site}/wp-json/wp/v2/department?per_page=100`));
          const fb = (dep || []).find(x => /football/i.test(String(x.slug || '') + ' ' + String(x.name || '')));
          if (!fb) throw new Error('no football department');
          const roster = JSON.parse(await fetchText(`https://${site}/wp-json/wp/v2/roster?department=${fb.id}&per_page=100&_fields=id,title`));
          const staff = [];
          const tasks = (roster || []).map(item => async () => {
            try {
              const d = JSON.parse(await fetchText(`https://${site}/wp-json/v1/posts/${item.id}/fields`));
              const role = String((((d || {}).data || {}).content || {}).position || '').trim();
              const name = String(((item.title || {}).rendered || '')).replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
              if (name && role) staff.push({ role, name });
            } catch { /* one bio miss is fine */ }
          });
          await runTasks(tasks, 8, deadline);
          return staff;
        };
        const fetchStaff = async (t) => {
          if (t.kind === 'nfl') {
            const page = 'Template:' + t.team.replace(/ /g, '_') + '_staff';
            const d = await wiki('action=parse&prop=wikitext&redirects=1&page=' + encodeURIComponent(page));
            return { page, staff: parseStaffLines(d.parse.wikitext['*'], true) };
          }
          const site = COLLEGE_SITES[t.team.toLowerCase().trim()];
          if (!site) throw new Error('no athletics-site mapping');
          let staff = [];
          try { staff = parseSidearmStaff(await fetchText(`https://${site}/staff-directory`)); } catch { /* fall through */ }
          if (staff.length) return { page: `https://${site}/staff-directory`, staff };
          try { staff = parseWmtRoster(await fetchText(`https://${site}/sports/football/roster/`)); } catch { /* fall through */ }
          if (staff.length) return { page: `https://${site}/sports/football/roster/`, staff };
          staff = await wmtRest(site);
          if (!staff.length) throw new Error('all three staff sources parsed 0');
          return { page: `https://${site}/wp-json (WMT REST)`, staff };
        };

        // Teams on the roster (skip FA/retired NFL rows).
        const teams = [];
        const seenT = new Set();
        nflPlayers.forEach(p => { const t = String(p['Team'] || '').trim(); const k = t.toLowerCase(); if (t && !/free agent|retired|inactive|cfl|ufl|xfl/i.test(t) && !seenT.has(k)) { seenT.add(k); teams.push({ team: t, kind: 'nfl' }); } });
        colPlayers.forEach(p => { const t = String(p['School'] || '').trim(); const k = t.toLowerCase(); if (t && !seenT.has(k)) { seenT.add(k); teams.push({ team: t, kind: 'college' }); } });
        const capC = parseInt((req.query || {}).maxdisc, 10) || 12;
        const staleTeams = teams.filter(t => {
          const rec = tsByTeam[t.team.toLowerCase()];
          if (!rec) return true;
          const d = new Date(String(rec.cells[4] || ''));
          return isNaN(d) || (Date.now() - d.getTime()) / 86400000 > 5;
        });
        const rotC = staleTeams.length ? Math.floor(Date.now() / 86400000) % staleTeams.length : 0;
        const targetsC = [...staleTeams.slice(rotC), ...staleTeams.slice(0, rotC)].slice(0, capC);
        for (const t of targetsC) {
          if (Date.now() > deadline) break;
          try {
            const { page, staff } = await fetchStaff(t);
            if (!staff.length) throw new Error('parsed 0 staff from ' + page);
            coaches.teams++;
            const key = t.team.toLowerCase();
            const rowVals = [t.team, t.kind, page, JSON.stringify(staff).slice(0, 45000), new Date().toISOString().slice(0, 10)];
            const rec = tsByTeam[key];
            if (!dryRun) {
              if (rec) await sheetBatchUpdate(token, [{ range: `'TeamStaff'!A${rec.row}:E${rec.row}`, values: [rowVals] }]);
              else {
                await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'TeamStaff'!A:E")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
                  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ values: [rowVals] }),
                });
                tsLastRow += 1;
              }
            }
            tsByTeam[key] = { row: rec ? rec.row : tsLastRow, cells: rowVals };
          } catch (e) { coaches.errors.push(`${t.team}: ${e.message}`); }
        }

        // Match every rostered athlete's position group to their team's staff.
        const posCoachFor = (position, staff) => {
          const P = String(position || '').toUpperCase().split('/')[0].trim();
          const pats =
            /^QB/.test(P) ? [/quarterback/i]
            : /^(RB|FB|HB)/.test(P) ? [/running back/i]
            : /^WR/.test(P) ? [/wide receiver|receivers/i]
            : /^TE/.test(P) ? [/tight end/i]
            : /^(EDGE|RUSH)/.test(P) ? [/edge|outside linebacker|defensive end/i, /defensive line/i, /linebacker/i]
            : /^(DE|DT|NT|DL)/.test(P) ? [/defensive line|defensive tackle|defensive end/i]
            : /^(OLB)/.test(P) ? [/outside linebacker/i, /linebacker/i]
            : /^(LB|ILB|MLB)/.test(P) ? [/inside linebacker/i, /(?<!outside )linebacker/i, /linebacker/i]
            : /^(CB|DB|NB)/.test(P) ? [/cornerback/i, /secondary|defensive back/i]
            : /^(S|FS|SS|SAF)\b/.test(P) ? [/safet/i, /secondary|defensive back/i]
            : /^(K|P|LS|PK)\b/.test(P) ? [/special teams/i]
            : /^(OT|OG|C|G|T|OL)\b/.test(P) ? [/offensive line/i]
            : [];
          for (const re of pats) {
            const strong = staff.filter(x => re.test(x.role) && !/assistant|quality control|analyst|intern|graduate|chief of staff|emeritus/i.test(x.role));
            if (strong.length) return strong[0].name;
            const weak = staff.filter(x => re.test(x.role) && !/quality control|analyst|intern|graduate/i.test(x.role));
            if (weak.length) return weak[0].name;
          }
          return '';
        };
        const cUpdates = [];
        const everyone = [
          ...nflPlayers.map(p => ({ p, team: p['Team'] })),
          ...colPlayers.map(p => ({ p, team: p['School'] })),
        ];
        for (const { p, team } of everyone) {
          const rec = tsByTeam[String(team || '').toLowerCase().trim()];
          if (!rec) continue;
          let staff;
          try { staff = JSON.parse(rec.cells[3] || '[]'); } catch { continue; }
          const coach = posCoachFor(p['Position'], staff);
          if (!coach) { coaches.misses++; continue; }
          const rowNum = await ensureAutoRow(p['Name']);
          if (!rowNum || pcCol < 0) continue;
          cUpdates.push({ range: `'AutoSync'!${colLetter(pcCol)}${rowNum}`, values: [[coach]] });
          coaches.matched++;
        }
        if (!dryRun) for (let i = 0; i < cUpdates.length; i += 100) await sheetBatchUpdate(token, cUpdates.slice(i, i + 100));
      } catch (e) { coaches.errors.push(e.message); }
    }

    // ── StatHistory: one row per athlete per day with depth rank (NFL/College,
    // from Ourlads) and 247 rating/ranks (HS). Hidden robot tab — feeds the
    // depth-riser / rank-riser features with real history from day one.
    const statHistory = { rows: 0, skippedToday: false, pruned: 0, error: null };
    try { if (!onlyName) {
      const trend = {};
      for (const m of matches) { trend[nameKey(m.name)] = { name: m.name, depthRank: m.rank, depthPos: m.pos }; }
      for (const [k, v] of Object.entries(rankTrend)) trend[k] = { ...(trend[k] || {}), ...v };
      const entries = Object.values(trend);
      if (entries.length && !dryRun) {
        const HEAD = ['date', 'name', 'depthRank', 'depthPos', 'rating247', 'stars247', 'natRank247', 'posRank247', 'stateRank247'];
        const appendRows = (range, rows2) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: rows2 }),
        });
        let histD = null;
        try { histD = await sheetGet(token, "'StatHistory'!A:A"); }
        catch {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'StatHistory', hidden: true, gridProperties: { rowCount: 20000, columnCount: 9 } } } }] }),
          });
          await appendRows("'StatHistory'!A:I", [HEAD]);
          histD = { values: [['date']] };
        }
        const today = new Date().toISOString().slice(0, 10);
        const dates = (histD.values || []).slice(1).map(r => String(r[0] || ''));
        if (dates.includes(today)) {
          statHistory.skippedToday = true;
        } else {
          await appendRows("'StatHistory'!A:I", entries.map(v =>
            [today, v.name, v.depthRank ?? '', v.depthPos ?? '', v.rating247 ?? '', v.stars247 ?? '', v.natRank247 ?? '', v.posRank247 ?? '', v.stateRank247 ?? '']));
          statHistory.rows = entries.length;
        }
        // Prune >60-day-old rows once a real backlog builds (append-only tab —
        // oldest rows sit directly under the header).
        const oldCount = dates.filter(d => { const t = new Date(d); return !isNaN(t) && (Date.now() - t.getTime()) / 86400000 > 60; }).length;
        if (oldCount > 600) {
          const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`, { headers: { Authorization: `Bearer ${token}` } });
          const meta = await metaR.json();
          const shMeta = (meta.sheets || []).find(s => (s.properties?.title || '').trim() === 'StatHistory');
          if (shMeta) {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
              method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: shMeta.properties.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + oldCount } } }] }),
            });
            statHistory.pruned = oldCount;
          }
        }
      }
    } } catch (e) { statHistory.error = e.message; }

    return res.json({
      success: true, dryRun, task, timedOut, proxyActive: !!proxyDispatcher, statHistory, contracts,
      teamsFetched: Object.keys(byUrl).length,
      matched: matches.length, unmatchedCount: unmatched.length,
      cellsWritten,
      unmatched: unmatched.slice(0, 40),
      unresolvedTeams: [...unresolvedTeams].slice(0, 20),
      fetchErrors: fetchErrors.slice(0, 10),
      sample: matches.slice(0, 12),
      espn: { updated: espn.updated, idsFound: espn.idsFound, errors: espn.errors.slice(0, 10) },
      hs247,
      recruits: { ...recruits, ambiguous: recruits.ambiguous.slice(0, 15), errors: recruits.errors.slice(0, 10) },
      pipeline: { ...pipeline, ambiguous: pipeline.ambiguous.slice(0, 15), errors: pipeline.errors.slice(0, 5) },
      coaches: { ...coaches, errors: coaches.errors.slice(0, 10) },
    });
  } catch (err) {
    console.error('Depth refresh error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Exposed for tests only.
module.exports._test = { nameKey, parseDepthChart, parseCollegeIndex, collegeUrlFor };
