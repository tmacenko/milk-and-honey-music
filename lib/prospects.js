// Prospect search data builder (sports "Prospect Search" page).
//
// Source: CollegeFootballData.com (CFBD_API_KEY). Player ids are ESPN's, so
// rows join our roster/recruiting board by espnId and borrow ESPN headshots.
// One rebuild ≈ 10 API calls (rosters, teams, SP+, current-season stats,
// six recruiting classes) — the free tier allows 1,000/month.
//
// Output is ONE compact, disposable file (positional arrays, not objects —
// ~31k players) that the browser downloads and filters locally. Nothing here
// is hand-edited; the weekly cron simply regenerates it.
//
// Past seasons never change, so their per-player stat vectors are cached in
// their own files and fetched from CFBD once (at most `pastPerRun` per build
// to stay inside the function time limit).
const API = 'https://api.collegefootballdata.com';
const { nameKey, fetchCollegeDepth } = require('./ourlads');

// Stat vector layout — shared by season and career vectors.
const STATS = [
  ['passCmp', 'passing', 'COMPLETIONS'], ['passAtt', 'passing', 'ATT'], ['passYds', 'passing', 'YDS'], ['passTd', 'passing', 'TD'], ['passInt', 'passing', 'INT'],
  ['rushAtt', 'rushing', 'CAR'], ['rushYds', 'rushing', 'YDS'], ['rushTd', 'rushing', 'TD'],
  ['rec', 'receiving', 'REC'], ['recYds', 'receiving', 'YDS'], ['recTd', 'receiving', 'TD'],
  ['tkl', 'defensive', 'TOT'], ['solo', 'defensive', 'SOLO'], ['tfl', 'defensive', 'TFL'], ['sacks', 'defensive', 'SACKS'], ['pd', 'defensive', 'PD'], ['qbh', 'defensive', 'QB HUR'],
  ['int', 'interceptions', 'INT'],
  ['fgm', 'kicking', 'FGM'], ['fga', 'kicking', 'FGA'], ['punts', 'punting', 'NO'], ['puntYds', 'punting', 'YDS'],
  ['krYds', 'kickReturns', 'YDS'], ['prYds', 'puntReturns', 'YDS'],
  // Appended later — older cached season vectors are simply shorter.
  ['puntIn20', 'punting', 'In 20'], ['puntTb', 'punting', 'TB'],
];
// Position → group (same groups as the app's PX_POS_GROUPS).
const POS_GROUPS = [
  ['QB', ['QB', 'PRO', 'DUAL']], ['RB', ['RB', 'FB', 'APB']], ['WR', ['WR']], ['TE', ['TE']],
  ['OL', ['OL', 'OT', 'OG', 'C', 'G', 'T', 'IOL']], ['DL', ['DL', 'DE', 'DT', 'NT', 'EDGE', 'SDE', 'WDE', 'IDL']],
  ['LB', ['LB', 'ILB', 'OLB', 'MLB']], ['DB', ['DB', 'CB', 'S', 'FS', 'SS', 'SAF']],
  ['K/P', ['K', 'P', 'PK', 'LS']], ['ATH', ['ATH']],
];
const groupOf = (pos) => (POS_GROUPS.find(([, l]) => l.includes(String(pos || '').toUpperCase())) || [''])[0];
const STAT_INDEX = {};
STATS.forEach(([, cat, type], i) => { STAT_INDEX[cat + '|' + type] = i; });
const SI = {}; STATS.forEach(([k], i) => { SI[k] = i; });
// A real season of contribution at the position (full-season stats). Offensive
// linemen have no individual stats, so they never count either way.
function regularSeason(v, grp) {
  if (!v) return false;
  const g = (k) => v[SI[k]] || 0;
  switch (grp) {
    case 'QB': return g('passAtt') >= 30;
    case 'RB': return g('rushAtt') >= 20 || g('rec') >= 10;
    case 'WR': return g('rec') >= 8;
    case 'TE': return g('rec') >= 5;
    case 'DL': return g('tkl') >= 8 || g('sacks') >= 2;
    case 'LB': return g('tkl') >= 12;
    case 'DB': return g('tkl') + g('pd') >= 8;
    case 'K/P': return g('fga') >= 4 || g('punts') >= 8;
    case 'ATH': return g('rushAtt') + g('rec') + g('tkl') >= 10;
    default: return false;
  }
}

// NFL draft position → our position group.
function draftGroup(pos) {
  const p = String(pos || '').toLowerCase();
  if (/quarterback/.test(p)) return 'QB';
  if (/running back|fullback/.test(p)) return 'RB';
  if (/wide receiver/.test(p)) return 'WR';
  if (/tight end/.test(p)) return 'TE';
  if (/offensive|center|guard|tackle/.test(p) && !/defensive/.test(p)) return 'OL';
  if (/defensive|edge|end|nose/.test(p)) return 'DL';
  if (/linebacker/.test(p)) return 'LB';
  if (/cornerback|safety|defensive back/.test(p)) return 'DB';
  if (/kicker|punter|long snap/.test(p)) return 'K/P';
  return '';
}
const POWER4 = new Set(['SEC', 'Big Ten', 'Big 12', 'ACC']);
function tierOf(team) {
  if (!team) return '';
  if (team.classification === 'fbs') return POWER4.has(team.conference) || team.school === 'Notre Dame' ? 'P4' : 'G5';
  return { fcs: 'FCS', ii: 'D2', iii: 'D3' }[team.classification] || '';
}

async function cfbd(path, key) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`CFBD ${path} → HTTP ${r.status}`);
  const d = await r.json();
  // CFBD answers over-eager parallel calls with a short error object; every
  // endpoint used here returns an array when it actually worked.
  if (!Array.isArray(d)) throw new Error(`CFBD ${path} → ${JSON.stringify(d).slice(0, 120)}`);
  return d;
}
// CFBD rejects bursts of simultaneous requests — keep at most `n` in flight.
async function limited(tasks, n) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

// {playerId: [stat vector]} for one season.
function seasonVectors(rows) {
  const out = {};
  for (const x of rows) {
    const i = STAT_INDEX[x.category + '|' + x.statType];
    if (i === undefined) continue;
    const v = out[x.playerId] || (out[x.playerId] = new Array(STATS.length).fill(0));
    const n = parseFloat(x.stat);
    if (Number.isFinite(n)) v[i] += n;
  }
  return out;
}

// store: { get(name) → object|null, put(name, object) } — Blob in prod,
// a folder when run locally.
// Timing (measured 2026-09-29): CFBD's all-player season stats take ~23s for
// the current season and ~50s for a finished one; everything else is fast.
// So a run = fast pulls + current stats (~30s), then past seasons only while
// `deadline` leaves room for another ~60s fetch.
async function buildProspects({ key, store, season, pastSeasons = 5, pastPerRun = 1, deadline = Date.now() + 240000 }) {
  const log = [];
  const now = new Date();
  season = season || (now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);

  // The slow stats call runs alongside the quick ones (2 in flight).
  const [statRows, roster, teams, sp] = await limited([
    () => cfbd(`/stats/player/season?year=${season}`, key),
    () => cfbd(`/roster?year=${season}`, key),
    () => cfbd(`/teams?year=${season}`, key),
    () => cfbd(`/ratings/sp?year=${season}`, key).catch(() => []),
  ], 2);
  log.push(`roster ${roster.length}, teams ${teams.length}, sp ${sp.length}, stat rows ${statRows.length}`);

  // Recruiting classes that could still be on a roster (≈6 years back).
  const recruitById = {}, recruitByAthlete = {};
  // Team context + movement: usage (share of team plays), returning
  // production, talent index, head coaches, transfer portal (this cycle and
  // the next, which fills in once its window opens). ~6 fast calls.
  const [usage, returning, talent, coaches, portalNow, portalNext, ppa, gamesFbs, gamesFcs, teamStats, portalPrev, spPrevList] = await limited([
    () => cfbd(`/player/usage?year=${season}`, key).catch(() => []),
    () => cfbd(`/player/returning?year=${season}`, key).catch(() => []),
    () => cfbd(`/talent?year=${season}`, key).catch(() => []),
    // Several seasons of coaching records: tenure and last season's record
    // for the team-fit coach-stability estimate.
    () => cfbd(`/coaches?minYear=${season - 4}&maxYear=${season}`, key).catch(() => []),
    () => cfbd(`/player/portal?year=${season}`, key).catch(() => []),
    () => cfbd(`/player/portal?year=${season + 1}`, key).catch(() => []),
    // Efficiency (expected points added per play) for offensive players, and
    // games played per team (for per-game rates in the production score).
    () => cfbd(`/ppa/players/season?year=${season}`, key).catch(() => []),
    () => cfbd(`/games?year=${season}&classification=fbs`, key).catch(() => []),
    () => cfbd(`/games?year=${season}&classification=fcs`, key).catch(() => []),
    // Team season totals — pass/run balance for the team-fit scheme factor.
    () => cfbd(`/stats/season?year=${season}`, key).catch(() => []),
    // Last year's portal cycle (how teams build rosters) and last season's
    // SP+ (program direction).
    () => cfbd(`/player/portal?year=${season - 1}`, key).catch(() => []),
    () => cfbd(`/ratings/sp?year=${season - 1}`, key).catch(() => []),
  ], 2);
  const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
  const ppaBy = {};
  // [avg all, avg pass, avg rush, plays]. Plays = total ÷ average — some
  // records rest on a single play (seen 2026-09-30), so the score needs it.
  ppa.forEach(x => {
    if (!x.id || !x.averagePPA) return;
    const avg = x.averagePPA.all, tot = x.totalPPA ? x.totalPPA.all : null;
    const plays = avg && tot != null ? Math.round(Math.abs(tot / avg)) : 0;
    ppaBy[x.id] = [r3(avg), r3(x.averagePPA.pass), r3(x.averagePPA.rush), plays];
  });
  const gamesBy = {};
  const seenGame = new Set();
  [...gamesFbs, ...gamesFcs].forEach(g => {
    if (!g.completed || seenGame.has(g.id)) return;
    seenGame.add(g.id);
    [g.homeTeam, g.awayTeam].forEach(t => { if (t) gamesBy[t] = (gamesBy[t] || 0) + 1; });
  });
  const usageBy = {};
  usage.forEach(u => { if (u.id && u.usage) usageBy[u.id] = [u.usage.overall, u.usage.pass, u.usage.rush].map(x => Math.round((x || 0) * 1000) / 1000); });
  const retBy = {}; returning.forEach(t => { retBy[t.team] = t; });
  const talentSorted = [...talent].sort((a, b) => parseFloat(b.talent) - parseFloat(a.talent));
  const talentBy = {}; talentSorted.forEach((t, i) => { talentBy[t.team] = [Math.round(parseFloat(t.talent)), i + 1]; });
  const coachBy = {};
  const recPrevBy = {};
  coaches.forEach(c => (c.seasons || []).forEach(se => {
    if (!se.school) return;
    if (se.year === season) {
      // First season in charge at THIS school: CFBD's hireDate is the coach's
      // first hire anywhere (Satterfield's is Louisville), so count back
      // through consecutive seasons here; only a streak reaching the start of
      // the window falls back to the hire date (hired in the fall/winter →
      // the next season).
      // (A short interim stint — under 6 games — doesn't count.)
      const here = new Set((c.seasons || []).filter(x => x.school === se.school && (x.year === season || (x.wins || 0) + (x.losses || 0) >= 6)).map(x => x.year));
      let first = season; while (here.has(first - 1)) first--;
      const hd = c.hireDate ? new Date(c.hireDate) : null;
      const hired = hd && !isNaN(hd) ? hd.getUTCFullYear() + (hd.getUTCMonth() >= 6 ? 1 : 0) : 0;
      if (first <= season - 4 && hired && hired < first) first = hired;
      coachBy[se.school] = [`${c.firstName} ${c.lastName}`.trim(), (se.wins || 0) + (se.losses || 0) > 0 ? `${se.wins}-${se.losses}` : '', first];
    }
    if (se.year === season - 1 && (se.wins || 0) + (se.losses || 0) > 0) recPrevBy[se.school] = `${se.wins}-${se.losses}`;
  }));
  const spPrevBy = {}; spPrevList.forEach(t => { if (t.team && t.ranking) spPrevBy[t.team] = t.ranking; });
  const passBy = {};
  teamStats.forEach(x => { const o = passBy[x.team] || (passBy[x.team] = {}); o[x.statName] = parseFloat(x.statValue) || 0; });
  const passRate = (name) => { const o = passBy[name]; const n = o ? (o.passAttempts || 0) + (o.rushingAttempts || 0) : 0; return n ? Math.round((o.passAttempts / n) * 1000) / 1000 : 0; };

  // NFL draft picks by college and position group, last five drafts. Past
  // drafts never change, so each year is cached after its first fetch (the
  // current year once the April draft is done).
  const draftBy = {};
  for (let y = season - 4; y <= season; y++) {
    let d = await store.get(`prospects-draft-${y}.json`);
    if (!d) {
      const picks = await cfbd(`/draft/picks?year=${y}`, key).catch(() => null);
      if (picks && picks.length) {
        d = {};
        picks.forEach(p => { const g = draftGroup(p.position); if (!p.collegeTeam || !g) return; const o = d[p.collegeTeam] || (d[p.collegeTeam] = {}); o[g] = (o[g] || 0) + 1; });
        if (y < season || now.getUTCMonth() >= 4) await store.put(`prospects-draft-${y}.json`, d);
      }
    }
    if (!d) continue;
    Object.entries(d).forEach(([team, o]) => { const t = draftBy[team] || (draftBy[team] = {}); Object.entries(o).forEach(([g, n]) => { t[g] = (t[g] || 0) + n; }); });
  }
  log.push(`portal prev ${portalPrev.length}, sp prev ${spPrevList.length}`);
  log.push(`usage ${usage.length}, returning ${returning.length}, talent ${talent.length}, coaches ${coaches.length}, portal ${portalNow.length}+${portalNext.length}, ppa ${ppa.length}, games ${seenGame.size}`);

  // …plus next year's class: current high school seniors (CFBD carries a
  // class only once it's in its final recruiting year — juniors aren't there).
  const classes = [];
  for (let y = season - 5; y <= season + 1; y++) classes.push(y);
  const recs = await limited(classes.map(y => () => cfbd(`/recruiting/players?year=${y}`, key).catch(() => [])), 2);
  const hsClass = season + 1;
  const hsRecruits = (recs[recs.length - 1] || []).filter(r => r.recruitType === 'HighSchool');
  recs.slice(0, -1).forEach(list => list.forEach(r => {
    // A player can have HS and JUCO records — keep the high-school one for
    // the "high school" filter, but remember either.
    const prev = recruitByAthlete[r.athleteId];
    if (!prev || (prev.recruitType !== 'HighSchool' && r.recruitType === 'HighSchool')) { if (r.athleteId) recruitByAthlete[r.athleteId] = r; }
    recruitById[r.id] = r;
  }));
  log.push(`recruits ${Object.keys(recruitById).length}`);

  // Past seasons: cached vectors, fetched once each.
  const career = {};
  const pastVec = {};
  const pastLoaded = [], pastMissing = [];
  let fetchedPast = 0;
  // Newest first: recent seasons matter most if a run can only fetch a few.
  for (let y = season - 1; y >= season - pastSeasons; y--) {
    let vec = await store.get(`prospects-season-${y}.json`);
    if (!vec && fetchedPast < pastPerRun && deadline - Date.now() > 70000) {
      vec = seasonVectors(await cfbd(`/stats/player/season?year=${y}`, key));
      await store.put(`prospects-season-${y}.json`, vec);
      fetchedPast++;
    }
    if (!vec) { pastMissing.push(y); continue; }
    pastVec[y] = vec;
    pastLoaded.push(y);
    for (const [id, v] of Object.entries(vec)) {
      const c = career[id] || (career[id] = new Array(STATS.length).fill(0));
      v.forEach((n, i) => { c[i] += n; });
    }
  }
  const current = seasonVectors(statRows);
  for (const [id, v] of Object.entries(current)) {
    const c = career[id] || (career[id] = new Array(STATS.length).fill(0));
    v.forEach((n, i) => { c[i] += n; });
  }

  // ── Program pathways: how players actually got on the field ──
  // Freshman path: a school's high school signees (last few classes with two
  // finished seasons) — how many became regulars there within two seasons,
  // and how many were gone by year two. Transfer path: transfers a school
  // brought in (last three finished cycles) — how many became regulars in
  // their first season there. Rosters and portal lists for finished seasons
  // never change, so each is fetched once and cached.
  const pathways = { teams: {}, nat: {}, classes: [], cycles: [] };
  try {
    const rosterOf = async (y) => {
      if (y === season) return null;
      let r = await store.get(`prospects-roster-${y}.json`);
      if (!r && deadline - Date.now() > 60000) {
        const list = await cfbd(`/roster?year=${y}`, key).catch(() => null);
        if (list && list.length) { r = {}; list.forEach(p => { if (p.id) r[p.id] = [p.team || '', p.position || '', nameKey(`${p.firstName} ${p.lastName}`)]; }); await store.put(`prospects-roster-${y}.json`, r); }
      }
      return r;
    };
    const portalOf = async (y) => {
      if (y === season - 1) return portalPrev;
      let r = await store.get(`prospects-portal-${y}.json`);
      if (!r && deadline - Date.now() > 60000) {
        const list = await cfbd(`/player/portal?year=${y}`, key).catch(() => null);
        if (list && list.length) { r = list.map(e => ({ firstName: e.firstName, lastName: e.lastName, position: e.position, destination: e.destination })); await store.put(`prospects-portal-${y}.json`, r); }
      }
      return r || [];
    };
    const bump = (team, grp, i) => {
      if (!team || !grp || grp === 'OL') return;
      const t = pathways.teams[team] || (pathways.teams[team] = {});
      const a = t[grp] || (t[grp] = [0, 0, 0, 0, 0]); a[i]++;
      const n = pathways.nat[grp] || (pathways.nat[grp] = [0, 0, 0, 0, 0]); n[i]++;
    };
    // Freshman path — classes with seasons Y and Y+1 both finished and cached.
    const rosters = {};
    for (let y = season - 4; y <= season - 1; y++) rosters[y] = await rosterOf(y);
    for (let ci = 0; ci < classes.length; ci++) {
      const Y = classes[ci];
      if (!(pastVec[Y] && pastVec[Y + 1] && rosters[Y] && rosters[Y + 1])) continue;
      pathways.classes.push(Y);
      for (const r of recs[ci] || []) {
        if (r.recruitType !== 'HighSchool' || !r.committedTo || !r.athleteId) continue;
        const id = String(r.athleteId), T = r.committedTo;
        const r1 = rosters[Y][id];
        if (!r1 || r1[0] !== T) continue; // never enrolled there (or unknown)
        const grp = groupOf(r1[1]) || groupOf(r.position);
        const r2 = rosters[Y + 1][id];
        const stayed = r2 && r2[0] === T;
        const hit = regularSeason(pastVec[Y][id], grp) || (stayed && regularSeason(pastVec[Y + 1][id], grp));
        bump(T, grp, 1); if (hit) bump(T, grp, 0); if (!stayed) bump(T, grp, 2);
      }
    }
    // Transfer path — cycles whose season is finished.
    for (let C = season - 3; C <= season - 1; C++) {
      const ros = rosters[C], vec = pastVec[C];
      if (!ros || !vec) continue;
      const byTeamName = {};
      Object.entries(ros).forEach(([id, [team, pos, nk]]) => { byTeamName[`${team}|${nk}`] = [id, pos]; });
      const list = await portalOf(C);
      if (!list.length) continue;
      pathways.cycles.push(C);
      for (const e of list) {
        if (!e.destination) continue;
        const m = byTeamName[`${e.destination}|${nameKey(`${e.firstName} ${e.lastName}`)}`];
        if (!m) continue; // didn't end up on the roster (or name mismatch)
        const grp = groupOf(m[1]) || groupOf(e.position);
        bump(e.destination, grp, 4); if (regularSeason(vec[m[0]], grp)) bump(e.destination, grp, 3);
      }
    }
    log.push(`pathways: classes ${pathways.classes.join(',') || '-'}, cycles ${pathways.cycles.join(',') || '-'}`);
  } catch (e) { log.push(`pathways failed: ${e.message}`); }

  // Team table: conference, tier, SP+ rank/rating, logo.
  const spBy = {};
  sp.forEach(t => { if (t.team) spBy[t.team] = t; });
  const teamBy = {};
  teams.forEach(t => { teamBy[t.school] = t; });
  const teamOut = {};
  const pct = (x) => (x == null ? 0 : Math.round(x * 100));
  for (const name of new Set([...roster.map(p => p.team), ...hsRecruits.map(r => r.committedTo).filter(Boolean)])) {
    const t = teamBy[name], s = spBy[name], r = retBy[name], tl = talentBy[name] || [0, 0], co = coachBy[name] || ['', '', 0], loc = t?.location || {};
    teamOut[name] = [t?.conference || '', tierOf(t), s?.ranking || 0, s ? Math.round(s.rating * 10) / 10 : 0, (t?.logos || [])[0] || '', t?.abbreviation || '',
      tl[0], tl[1], pct(r?.percentPPA), pct(r?.percentPassingPPA), pct(r?.percentReceivingPPA), pct(r?.percentRushingPPA), co[0], co[1], gamesBy[name] || 0,
      loc.latitude ? Math.round(loc.latitude * 100) / 100 : 0, loc.longitude ? Math.round(loc.longitude * 100) / 100 : 0, passRate(name), draftBy[name] || 0,
      co[2] || 0, spPrevBy[name] || 0, recPrevBy[name] || ''];
  }

  // Depth charts (Ourlads) for every FBS team — cached a week; refreshed only
  // when the run has time to spare (~130 pages, a few at a time).
  let depth = await store.get('prospects-depth.json');
  if ((!depth || Date.now() - (depth.ts || 0) > 6 * 864e5) && deadline - Date.now() > 90000) {
    try {
      const fbs = teams.filter(t => t.classification === 'fbs').map(t => t.school);
      const got = await fetchCollegeDepth(fbs, { deadline: Math.min(deadline - 60000, Date.now() + 60000) });
      if (got.fetched > 50) {
        depth = { ts: Date.now(), teams: got.teams }; await store.put('prospects-depth.json', depth);
        // Weekly archive — no one keeps historical depth charts, so saving
        // them is the only way to later test whether "projected starter"
        // (depth chart + production) predicts who plays.
        await store.put(`prospects-depth-archive/${new Date().toISOString().slice(0, 10)}.json`, { ...depth, season }).catch(() => {});
      }
      log.push(`depth charts ${got.fetched}/${got.requested}${got.errors ? `, ${got.errors} errors` : ''}`);
    } catch (e) { log.push(`depth charts failed: ${e.message}`); }
  }
  const depthTeams = (depth && depth.teams) || {};

  const round = (v) => v.map(n => Math.round(n * 10) / 10);
  const players = [];
  for (const p of roster) {
    if (!p.id || !p.lastName) continue;
    const rec = recruitByAthlete[p.id] || (p.recruitIds || []).map(id => recruitById[id]).find(Boolean) || null;
    const cur = current[p.id], car = career[p.id];
    players.push([
      String(p.id), p.firstName || '', p.lastName || '', p.team || '', p.position || '',
      p.height || 0, p.weight || 0, p.year || 0, p.jersey ?? '',
      p.homeCity || '', p.homeState || '',
      p.homeLatitude ? Math.round(p.homeLatitude * 100) / 100 : 0, p.homeLongitude ? Math.round(p.homeLongitude * 100) / 100 : 0,
      rec?.school || '', rec?.stars || 0, rec?.rating ? Math.round(rec.rating * 10000) / 10000 : 0, rec?.ranking || 0, rec?.year || 0, rec?.recruitType || '',
      cur ? round(cur) : 0, car ? round(car) : 0, '', 'col', usageBy[p.id] || 0, ppaBy[p.id] || 0,
      ((depthTeams[p.team] || {})[nameKey(`${p.firstName} ${p.lastName}`)]) || 0,
    ]);
  }
  // High school seniors: no college team, no stats; `commit` = committed school.
  for (const r of hsRecruits) {
    const parts = String(r.name || '').trim().split(/\s+/);
    if (!parts[0]) continue;
    const h = r.hometownInfo || {};
    players.push([
      'r' + r.id, parts[0], parts.slice(1).join(' '), '', r.position || '',
      r.height || 0, r.weight || 0, 0, '',
      r.city || '', r.stateProvince || '',
      h.latitude ? Math.round(h.latitude * 100) / 100 : 0, h.longitude ? Math.round(h.longitude * 100) / 100 : 0,
      r.school || '', r.stars || 0, r.rating ? Math.round(r.rating * 10000) / 10000 : 0, r.ranking || 0, r.year || hsClass, 'HighSchool',
      0, 0, r.committedTo || '', 'hs', 0, 0, 0,
    ]);
  }
  log.push(`high school class of ${hsClass}: ${hsRecruits.length}`);
  log.push(`players ${players.length}, with stats ${Object.keys(current).length}, career seasons ${[...pastLoaded, season].join(',')}`);

  return {
    data: {
      v: 2, ts: Date.now(), season, hsClass,
      teamCols: ['conf', 'tier', 'spRank', 'spRating', 'logo', 'abbr', 'talent', 'talentRank', 'retPct', 'retPass', 'retRec', 'retRush', 'coach', 'record', 'games', 'lat', 'lng', 'passRate', 'draft', 'hcFirst', 'spPrev', 'recPrev'],
      // Transfer portal: [first, last, pos, origin, destination, date, stars, eligibility, cycle]
      portal: [[portalPrev, season - 1], [portalNow, season], [portalNext, season + 1]].flatMap(([list, cyc]) => list.map(e => [
        e.firstName || '', e.lastName || '', e.position || '', e.origin || '', e.destination || '',
        String(e.transferDate || '').slice(0, 10), e.stars || 0, e.eligibility || '', cyc])),
      careerSeasons: [...pastLoaded, season].sort(),
      careerMissing: pastMissing,
      depthTs: depth ? depth.ts || 0 : 0, // Ourlads depth charts as of
      // Program pathways — teams[team][group] / nat[group] = [freshman regulars
      // by year 2, freshman signees, freshmen gone by year 2, transfer regulars
      // in year 1, transfers].
      pathways,
      cols: ['id', 'first', 'last', 'team', 'pos', 'ht', 'wt', 'yr', 'jersey', 'city', 'st', 'lat', 'lng', 'hs', 'stars', 'rating', 'natRank', 'recClass', 'recType', 'season', 'career', 'commit', 'kind', 'usage', 'ppa', 'depth'],
      stats: STATS.map(s => s[0]),
      teams: teamOut,
      players,
    },
    log,
  };
}

module.exports = { buildProspects, STATS };
