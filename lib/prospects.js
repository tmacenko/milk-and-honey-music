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

// Stat vector layout — shared by season and career vectors.
const STATS = [
  ['passCmp', 'passing', 'COMPLETIONS'], ['passAtt', 'passing', 'ATT'], ['passYds', 'passing', 'YDS'], ['passTd', 'passing', 'TD'], ['passInt', 'passing', 'INT'],
  ['rushAtt', 'rushing', 'CAR'], ['rushYds', 'rushing', 'YDS'], ['rushTd', 'rushing', 'TD'],
  ['rec', 'receiving', 'REC'], ['recYds', 'receiving', 'YDS'], ['recTd', 'receiving', 'TD'],
  ['tkl', 'defensive', 'TOT'], ['solo', 'defensive', 'SOLO'], ['tfl', 'defensive', 'TFL'], ['sacks', 'defensive', 'SACKS'], ['pd', 'defensive', 'PD'], ['qbh', 'defensive', 'QB HUR'],
  ['int', 'interceptions', 'INT'],
  ['fgm', 'kicking', 'FGM'], ['fga', 'kicking', 'FGA'], ['punts', 'punting', 'NO'], ['puntYds', 'punting', 'YDS'],
  ['krYds', 'kickReturns', 'YDS'], ['prYds', 'puntReturns', 'YDS'],
];
const STAT_INDEX = {};
STATS.forEach(([, cat, type], i) => { STAT_INDEX[cat + '|' + type] = i; });

const POWER4 = new Set(['SEC', 'Big Ten', 'Big 12', 'ACC']);
function tierOf(team) {
  if (!team) return '';
  if (team.classification === 'fbs') return POWER4.has(team.conference) || team.school === 'Notre Dame' ? 'P4' : 'G5';
  return { fcs: 'FCS', ii: 'D2', iii: 'D3' }[team.classification] || '';
}

async function cfbd(path, key) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`CFBD ${path} → HTTP ${r.status}`);
  return r.json();
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
async function buildProspects({ key, store, season, pastSeasons = 5, pastPerRun = 2 }) {
  const log = [];
  const now = new Date();
  season = season || (now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);

  const [roster, teams, sp, statRows] = await Promise.all([
    cfbd(`/roster?year=${season}`, key),
    cfbd(`/teams?year=${season}`, key),
    cfbd(`/ratings/sp?year=${season}`, key).catch(() => []),
    cfbd(`/stats/player/season?year=${season}`, key),
  ]);
  log.push(`roster ${roster.length}, teams ${teams.length}, sp ${sp.length}, stat rows ${statRows.length}`);

  // Recruiting classes that could still be on a roster (≈6 years back).
  const recruitById = {}, recruitByAthlete = {};
  const classes = [];
  for (let y = season - 5; y <= season; y++) classes.push(y);
  const recs = await Promise.all(classes.map(y => cfbd(`/recruiting/players?year=${y}`, key).catch(() => [])));
  recs.forEach(list => list.forEach(r => {
    // A player can have HS and JUCO records — keep the high-school one for
    // the "high school" filter, but remember either.
    const prev = recruitByAthlete[r.athleteId];
    if (!prev || (prev.recruitType !== 'HighSchool' && r.recruitType === 'HighSchool')) { if (r.athleteId) recruitByAthlete[r.athleteId] = r; }
    recruitById[r.id] = r;
  }));
  log.push(`recruits ${Object.keys(recruitById).length}`);

  // Past seasons: cached vectors, fetched once each.
  const career = {};
  const pastLoaded = [], pastMissing = [];
  let fetchedPast = 0;
  // Newest first: recent seasons matter most if a run can only fetch a few.
  for (let y = season - 1; y >= season - pastSeasons; y--) {
    let vec = await store.get(`prospects-season-${y}.json`);
    if (!vec && fetchedPast < pastPerRun) {
      vec = seasonVectors(await cfbd(`/stats/player/season?year=${y}`, key));
      await store.put(`prospects-season-${y}.json`, vec);
      fetchedPast++;
    }
    if (!vec) { pastMissing.push(y); continue; }
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

  // Team table: conference, tier, SP+ rank/rating, logo.
  const spBy = {};
  sp.forEach(t => { if (t.team) spBy[t.team] = t; });
  const teamBy = {};
  teams.forEach(t => { teamBy[t.school] = t; });
  const teamOut = {};
  for (const name of new Set(roster.map(p => p.team))) {
    const t = teamBy[name], s = spBy[name];
    teamOut[name] = [t?.conference || '', tierOf(t), s?.ranking || 0, s ? Math.round(s.rating * 10) / 10 : 0, (t?.logos || [])[0] || '', t?.abbreviation || ''];
  }

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
      cur ? round(cur) : 0, car ? round(car) : 0,
    ]);
  }
  log.push(`players ${players.length}, with stats ${Object.keys(current).length}, career seasons ${[...pastLoaded, season].join(',')}`);

  return {
    data: {
      v: 1, ts: Date.now(), season,
      careerSeasons: [...pastLoaded, season].sort(),
      careerMissing: pastMissing,
      cols: ['id', 'first', 'last', 'team', 'pos', 'ht', 'wt', 'yr', 'jersey', 'city', 'st', 'lat', 'lng', 'hs', 'stars', 'rating', 'natRank', 'recClass', 'recType', 'season', 'career'],
      stats: STATS.map(s => s[0]),
      teams: teamOut,
      players,
    },
    log,
  };
}

module.exports = { buildProspects, STATS };
