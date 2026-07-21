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
  // task=depth|espn|hs|all — the daily cron runs all three modules in order.
  const task = String((req.query || {}).task || 'all');
  const wants = (t) => task === 'all' || task === t;
  const deadline = Date.now() + 52000;

  try {
    const token = await getToken();
    const [nfl, col, hs, app, auto] = await Promise.all([
      sheetGet(token, 'NFL!A:P'), sheetGet(token, 'College!A:Q'), sheetGet(token, 'Highschool!A:S'),
      sheetGet(token, 'AppData!A:AZ'), sheetGet(token, "'AutoSync'!A:L"),
    ]);

    // Write target is the AutoSync tab (robot-owned; created by the sheet
    // migration). Athletes without a row get one appended below. New columns
    // for the ESPN/247 sync are appended to its header row on first run.
    const autoRows = auto.values || [];
    let autoHeaders = (autoRows[0] || []).map(h => String(h || '').trim());
    const AUTO_EXTRA = ['espnTeam', 'espnHeight', 'espnWeight', 'espnJersey', 'photo247'];
    const missingAuto = AUTO_EXTRA.filter(h => !autoHeaders.some(x => x.toLowerCase() === h.toLowerCase()));
    if (missingAuto.length && !dryRun) {
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
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'AutoSync'!A:L")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
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
    if (!appHeaders.some(h => h.toLowerCase() === 'teamoverride') && !dryRun) {
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
        await sheetBatchUpdate(token, [{ range: `AppData!${colLetter(appHeaders.length)}1`, values: [['teamOverride']] }]);
        appHeaders = [...appHeaders, 'teamOverride'];
      }
    }
    const appIdx = n => appHeaders.findIndex(h => h.toLowerCase() === n.toLowerCase());
    const appNameCol = appIdx('name'), espnIdCol = appIdx('espnId'), url247Col = appIdx('profileUrl247');
    const appByKey = {};
    appRows.forEach((r, i) => { if (i > 0 && appNameCol >= 0) { const k = nameKey(r[appNameCol]); if (k) appByKey[k] = { row: i + 1, cells: r }; } });

    const nflPlayers = parseRows(nfl);
    const colPlayers = parseRows(col);
    const hsPlayers = parseRows(hs);

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
          const teamVal = t.league === 'nfl' ? (teamObj.displayName || '') : (teamObj.location || '');
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
    const hs247 = { images: 0, errors: [], discovery: { found: 0, ambiguous: [], misses: [], errors: [] } };
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
          const rec = appByKey[nameKey(p['Name'])];
          if (rec && url247Col >= 0) {
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

    return res.json({
      success: true, dryRun, task, timedOut, proxyActive: !!proxyDispatcher,
      teamsFetched: Object.keys(byUrl).length,
      matched: matches.length, unmatchedCount: unmatched.length,
      cellsWritten,
      unmatched: unmatched.slice(0, 40),
      unresolvedTeams: [...unresolvedTeams].slice(0, 20),
      fetchErrors: fetchErrors.slice(0, 10),
      sample: matches.slice(0, 12),
      espn: { updated: espn.updated, idsFound: espn.idsFound, errors: espn.errors.slice(0, 10) },
      hs247,
    });
  } catch (err) {
    console.error('Depth refresh error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Exposed for tests only.
module.exports._test = { nameKey, parseDepthChart, parseCollegeIndex, collegeUrlFor };
