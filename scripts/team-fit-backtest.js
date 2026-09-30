// Team Fit backtest. For each past portal cycle Y (transfers who moved for
// season Y), rebuild the prospect data as of season Y-1 with the real build
// code, score every transfer's options with today's Team Fit model, then look
// up what happened at their actual destination in season Y.
//
// Usage: node scripts/team-fit-backtest.js [2023,2024,2025]
//   needs CFBD_API_KEY in .env (~25 CFBD calls per season, once). Season builds
//   are cached in .backtest-cache/ (git-ignored) so re-runs cost no API calls.
//   Re-run after model changes; PX_BT_OUTLOOK in App.jsx comes from this.
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const env = fs.readFileSync(path.join(REPO, '.env'), 'utf8');
const KEY = process.env.CFBD_API_KEY || (env.match(/^CFBD_API_KEY=(.*)$/m) || [])[1];
if (!KEY) { console.error('CFBD_API_KEY missing from .env'); process.exit(1); }
const { buildProspects } = require(path.join(REPO, 'lib/prospects.js'));

// App logic (same extraction the other local tests use).
const app = fs.readFileSync(process.env.APP_PATH || path.join(REPO, 'src/App.jsx'), 'utf8');
const grab = (a, b) => app.slice(app.indexOf(a), app.indexOf(b));
const code = grab('const PX_POS_GROUPS = [', 'const PX_CLASS')
  + grab('const PX_BUCKET = {', '// Production vs. peers: the score laid out')
  + grab('function pxMetric(', '// Short headers for the per-stat table columns.')
  + grab('const pxMiles = ', 'function loadProspectData(')
  + grab('const PX_ACADEMIC = ', "// A team's factor breakdown for one player");
const G = new Proxy({}, { get: () => '' });
const PX_TIER_NAME = { P4: 'Power 4', G5: 'Group of 5', FCS: 'FCS', D2: 'Division II' };
const slugOf = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
eval(code.replace(/^const /gm, 'var ').replace(/^function /gm, 'function '));

const STORE = path.join(REPO, '.backtest-cache');
fs.mkdirSync(STORE, { recursive: true });
const store = {
  get: async (n) => { try { return JSON.parse(fs.readFileSync(path.join(STORE, n), 'utf8')); } catch { return null; } },
  put: async (n, v) => fs.writeFileSync(path.join(STORE, n), JSON.stringify(v)),
};
async function built(season) {
  const f = `build-${season}.json`;
  let raw = await store.get(f);
  // Builds from before program pathways existed get rebuilt (with past
  // seasons, so pathways only use seasons before the one being tested).
  if (!raw || !raw.pathways) {
    console.error(`building season ${season}…`);
    const { data, log } = await buildProspects({ key: KEY, store, season, pastSeasons: 4, pastPerRun: 4, deadline: Date.now() + 1200000 });
    console.error('  ' + log.join(' | '));
    raw = data; await store.put(f, raw);
  }
  return parse(raw);
}
function parse(raw) {
  const C = {}; raw.cols.forEach((c, i) => { C[c] = i; }); const S = {}; raw.stats.forEach((c, i) => { S[c] = i; });
  const players = raw.players.map(p => { const hs = p[C.kind] === 'hs'; const t = hs ? [] : (raw.teams[p[C.team]] || []);
    return { id: p[C.id], name: `${p[C.first]} ${p[C.last]}`.trim(), team: p[C.team], pos: p[C.pos], grp: pxGroupOf(p[C.pos]), yr: p[C.yr], lat: p[C.lat], lng: p[C.lng], stars: p[C.stars], natRank: p[C.natRank], city: p[C.city], st: p[C.st],
      conf: t[0] || '', tier: hs ? 'HS' : (t[1] || ''), sp: t[2] || 0, season: p[C.season] || null, isHs: hs, usage: p[C.usage] || null, ppa: p[C.ppa] || null, commit: hs ? p[C.commit] : '',
      recClass: p[C.recClass] || 0, recType: p[C.recType] || '', depth: null }; }); // no historical depth charts exist — today's would leak the future
  const teamInfo = {}; Object.entries(raw.teams).forEach(([n, t]) => { const o = { name: n }; (raw.teamCols || []).forEach((c, i) => { o[c] = t[i]; }); o.sp = o.spRank || 0; teamInfo[n] = o; });
  players.forEach(p => { if (!p.isHs) p.metric = pxMetric(p.grp, p.season, S); });
  const scoreBuckets = pxScoreAll(players, S, teamInfo);
  const portal = (raw.portal || []).map(e => ({ name: `${e[0]} ${e[1]}`.trim(), pos: e[2], grp: pxGroupOf(e[2]), origin: e[3], dest: e[4], cycle: e[8] }));
  return { S, players, teamInfo, portal, season: raw.season, depthTs: 0, scoreBuckets, pathways: process.env.NO_PATH ? null : raw.pathways || null };
}
const nk = (x) => String(x || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z]/g, '');

(async () => {
  const cycles = (process.argv[2] || '2023,2024,2025').split(',').map(Number);
  const out = [];
  for (const Y of cycles) {
    const before = await built(Y - 1), after = await built(Y);
    const byTeamName = {}; before.players.forEach(p => { if (!p.isHs) byTeamName[`${p.team}|${nk(p.name)}`] = p; });
    const afterBy = {}; after.players.forEach(p => { if (!p.isHs) afterBy[`${p.team}|${nk(p.name)}`] = p; });
    const moves = before.portal.filter(e => e.cycle === Y && e.dest && e.origin);
    let n = 0;
    for (const e of moves) {
      const p = byTeamName[`${e.origin}|${nk(e.name)}`];
      if (!p || !p.grp || p.grp === 'K/P') continue;
      const res = pxFitRank(before, p, { ...PX_FIT_DEFAULT, w: { opp: 2, level: 2, nfl: 0, home: 0, acad: 0, scheme: 0, build: 0, coach: 0 }, tiers: ['P4', 'G5', 'FCS'] });
      if (!res) continue;
      const i = res.rows.findIndex(t => t.name === e.dest);
      if (i < 0) continue;
      const d = res.rows[i];
      const nxt = afterBy[`${e.dest}|${nk(e.name)}`];
      out.push({ Y, name: e.name, pos: p.pos, from: e.origin, to: e.dest, prodBefore: p.prodPct || 0,
        fit: d.fit, pct: Math.round(100 * (1 - i / res.rows.length)), opp: Math.round(d.f.opp[0]), slot: d.slot || 0, label: d.label,
        share: Math.round((d.share || 0) * 100), S0: PX_STARTERS[pxFitGroup(p.pos) || p.grp] || 1, lvDiff: Math.round((pxProgram(before).pct[e.dest] || 5) - res.D), stayW: d.stayW, portalOut: d.portalOut, commits: d.commits,
        fromTier: (before.teamInfo[e.origin] || {}).tier || '', toTier: (before.teamInfo[e.dest] || {}).tier || '', yr: p.yr, usageBefore: p.usage ? p.usage[0] : 0,
        found: !!nxt, played: !!(nxt && nxt.prodPct), prodAfter: nxt ? nxt.prodPct || 0 : 0, usageAfter: nxt && nxt.usage ? nxt.usage[0] : 0 });
      n++;
    }
    console.error(`cycle ${Y}: ${moves.length} moves, ${n} scored`);
  }
  fs.writeFileSync(path.join(STORE, process.env.OUT || 'backtest-results.json'), JSON.stringify(out));
  // Summary: did players the model liked for a destination actually play/produce there?
  const bands = (rows, key, cuts) => cuts.map(([lo, hi, label]) => {
    const g = rows.filter(r => r[key] >= lo && r[key] < hi && r.found);
    const pr = g.filter(r => r.played).length;
    const good = g.filter(r => r.prodAfter >= 50).length;
    return `${label.padEnd(18)} n=${String(g.length).padStart(4)}  played ${g.length ? Math.round(100 * pr / g.length) : 0}%  50th+ ${g.length ? Math.round(100 * good / g.length) : 0}%`;
  }).join('\n');
  console.log('\nBy playing-time score at the destination:');
  console.log(bands(out, 'opp', [[0, 40, 'low (<40)'], [40, 60, 'mid (40-59)'], [60, 80, 'good (60-79)'], [80, 101, 'high (80+)']]));
  console.log('\nBy projected slot (players with a production score before moving):');
  const withP = out.filter(r => r.prodBefore);
  console.log(['Projected starter', 'Next man up', 'Further down'].map((l, k) => {
    const g = withP.filter(r => r.found && (k === 0 ? r.slot && r.label !== undefined && r.opp >= 70 : k === 1 ? r.opp >= 45 && r.opp < 70 : r.opp < 45));
    return `${l.padEnd(18)} n=${String(g.length).padStart(4)}  played ${g.length ? Math.round(100 * g.filter(r => r.played).length / g.length) : 0}%  50th+ ${g.length ? Math.round(100 * g.filter(r => r.prodAfter >= 50).length / g.length) : 0}%`;
  }).join('\n'));
  console.log('\nBy level label:');
  console.log(['Reach', 'Match', 'Safe'].map(l => {
    const g = out.filter(r => r.found && r.label === l);
    return `${l.padEnd(18)} n=${String(g.length).padStart(4)}  played ${g.length ? Math.round(100 * g.filter(r => r.played).length / g.length) : 0}%  50th+ ${g.length ? Math.round(100 * g.filter(r => r.prodAfter >= 50).length / g.length) : 0}%`;
  }).join('\n'));
  console.log('\nBy overall fit rank of the actual destination (percentile among all options):');
  console.log(bands(out, 'pct', [[0, 50, 'bottom half'], [50, 75, '50-75th'], [75, 90, '75-90th'], [90, 101, 'top 10%']]));
})().catch(e => { console.error(e); process.exit(1); });
