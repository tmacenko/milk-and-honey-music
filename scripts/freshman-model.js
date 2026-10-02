// Freshman outlook model — "at this school, how often do recruits like him
// play by year 2?" Same shape as the transfer model:
//   1. Recruits like him: logistic on every high school signee found on a
//      roster since the 2020 class (stars/rank, position, how far the school
//      is above his level).
//   2. Room: share of the position's production leaving that school.
//   3. School record: how ALL its freshmen did vs. expected (shrunk).
// Outcomes: played = earned a production score in year 1 or 2 at that school;
// produced = above-median production by year 2. OL excluded (no stats).
//
// Usage: node scripts/freshman-model.js   (season builds cached by
//   scripts/team-fit-backtest.js). Writes src/pxFreshmanModel.json.
const fs = require('fs'), path = require('path');
const L = require('./team-fit-backtest.js');
const REPO = path.resolve(__dirname, '..');
const pxProgram = L.fn('pxProgram'), pxTeamNeeds = L.fn('pxTeamNeeds'), pxFitGroup = L.fn('pxFitGroup');
const K = Number(process.env.K || 20); // best holdout logloss for 'played'
const GRP_LIST = ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'ATH'];
const BANDS = {
  lvl: [[0, 60], [60, 75], [75, 88], [88, 95], [95, 101]], // recruit's level (stars / national rank, 0–100)
  step: [[-999, -15], [-15, 0], [0, 15], [15, 999]], // school level − recruit level
};
// Recruit level — the same mapping Team Fit uses (stars floor, national rank).
const recruitLevel = (stars, natRank) => {
  const starsD = { 5: 97, 4: 85, 3: 65, 2: 40 };
  const n = natRank || 0, rankD = !n ? 0 : n <= 50 ? 97 : n <= 150 ? 90 : n <= 300 ? 82 : n <= 500 ? 74 : 0;
  return Math.max(starsD[stars] || 45, rankD);
};
const bandOf = (k, v) => Math.max(0, BANDS[k].findIndex(([a, b]) => v >= a && v < b));
const NAMES = ['int', ...BANDS.lvl.slice(1).map((_, i) => `lvl${i + 1}`), ...BANDS.step.slice(1).map((_, i) => `step${i + 1}`), 'room', ...GRP_LIST.slice(1)];
function feats(r) {
  const x = new Array(NAMES.length).fill(0); x[0] = 1;
  const set = (n, v = 1) => { const i = NAMES.indexOf(n); if (i > 0) x[i] = v; };
  set(`lvl${bandOf('lvl', r.lvl)}`); set(`step${bandOf('step', r.step)}`); set('room', Math.min(100, r.share) / 100); set(r.grp);
  return x;
}
const sig = (z) => 1 / (1 + Math.exp(-z));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / r[i]);
}
function fitLogit(rows, y, lambda = 1) {
  const X = rows.map(feats), k = NAMES.length; let w = new Array(k).fill(0);
  for (let it = 0; it < 25; it++) {
    const H = Array.from({ length: k }, () => new Array(k).fill(0)), g = new Array(k).fill(0);
    X.forEach((x, i) => { const p = sig(dot(x, w)), d = p * (1 - p); for (let a = 0; a < k; a++) { g[a] += (y(rows[i]) - p) * x[a]; if (!x[a]) continue; for (let b = 0; b < k; b++) H[a][b] += d * x[a] * x[b]; } });
    for (let a = 1; a < k; a++) { H[a][a] += lambda; g[a] -= lambda * w[a]; }
    const st = solve(H, g); w = w.map((v, i) => v + st[i]); if (Math.max(...st.map(Math.abs)) < 1e-6) break;
  }
  return w;
}
function effects(rows, w, y, Kk) {
  const acc = {};
  rows.forEach(r => { const p = sig(dot(feats(r), w)); const a = acc[r.team] || (acc[r.team] = { n: 0, o: 0, e: 0, v: 0 }); a.n++; a.o += y(r); a.e += p; a.v += p * (1 - p); });
  Object.values(acc).forEach(a => { a.eff = (a.o - a.e) / (a.v + Kk); });
  return acc;
}
function auc(ps, ys) {
  const pos = [], neg = []; ps.forEach((p, i) => (ys[i] ? pos : neg).push(p)); neg.sort((a, b) => a - b);
  let s = 0; pos.forEach(p => { let lo = 0, hi = neg.length; while (lo < hi) { const m = (lo + hi) >> 1; if (neg[m] < p) lo = m + 1; else hi = m; } let e = lo; while (e < neg.length && neg[e] === p) e++; s += lo + (e - lo) / 2; });
  return s / pos.length / neg.length;
}
const logloss = (ps, ys) => -ps.reduce((s, p, i) => s + (ys[i] ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9))), 0) / ps.length;

(async () => {
  const seasons = fs.readdirSync(L.STORE).map(f => (f.match(/^build-(\d{4})\.json$/) || [])[1]).filter(Boolean).map(Number).sort();
  const B = {};
  for (const y of seasons) B[y] = await L.built(y);
  const last = seasons[seasons.length - 1] + 1, cur = path.join(L.STORE, `current-${last}.json`);
  if (fs.existsSync(cur)) B[last] = L.parse(JSON.parse(fs.readFileSync(cur, 'utf8')));
  const rows = [];
  // Freshman class Z: signees on a roster in season Z; outcome over Z and Z+1
  // (both finished); level and room come from the season before (Z−1), when
  // the choice was made.
  for (const Z of Object.keys(B).map(Number).sort()) {
    const prev = B[Z - 1], now = B[Z], next = B[Z + 1];
    if (!prev || !now || !next || Z + 1 >= last) continue;
    const prog = pxProgram(prev);
    const nextById = {}; next.players.forEach(p => { if (!p.isHs) nextById[p.id] = p; });
    const needs = {};
    for (const p of now.players) {
      if (p.isHs || p.recType !== 'HighSchool' || p.recClass !== Z || !p.team || !p.grp || !GRP_LIST.includes(p.grp)) continue;
      const fg = pxFitGroup(p.pos) || p.grp;
      const nk = `${p.grp}|${fg}`;
      if (!needs[nk]) { needs[nk] = {}; pxTeamNeeds(prev, p.grp, 1, fg).forEach(t => { needs[nk][t.name] = t.share || 0; }); }
      const lvl = recruitLevel(p.stars, p.natRank), T = prog.pct[p.team] != null ? prog.pct[p.team] : 5;
      const n2 = nextById[p.id], stayed = !!(n2 && n2.team === p.team);
      const played = !!p.prodPct || !!(stayed && n2.prodPct);
      const produced = (p.prodPct || 0) >= 50 || !!(stayed && (n2.prodPct || 0) >= 50);
      rows.push({ Z, team: p.team, grp: p.grp, stars: p.stars || 0, lvl, step: Math.round(T - lvl), share: Math.round(100 * (needs[nk][p.team] || 0)), played: played ? 1 : 0, produced: produced ? 1 : 0, stayed });
    }
  }
  const Y = { played: (r) => r.played, produced: (r) => r.produced };
  const classes = [...new Set(rows.map(r => r.Z))].sort();
  console.log(`signees ${rows.length} (OL excluded), classes ${classes.join(',')}, played by yr 2 ${Math.round(100 * rows.filter(r => r.played).length / rows.length)}%`);
  for (const [yk, y] of Object.entries(Y)) {
    console.log(`\n== ${yk} ==`);
    const test = classes.slice(-2), tr = rows.filter(r => !test.includes(r.Z)), te = rows.filter(r => test.includes(r.Z));
    const w = fitLogit(tr, y), ys = te.map(y), p0 = te.map(r => sig(dot(feats(r), w)));
    const base = tr.reduce((s, r) => s + y(r), 0) / tr.length;
    console.log(`holdout ${test.join(',')} (n ${te.length})`);
    console.log(`  national average only      AUC 0.500  logloss ${logloss(te.map(() => base), ys).toFixed(4)}`);
    console.log(`  recruits like him (model)  AUC ${auc(p0, ys).toFixed(3)}  logloss ${logloss(p0, ys).toFixed(4)}`);
    for (const Kk of [5, 10, 20, 40]) {
      const sch = effects(tr, w, y, Kk), ps = te.map((r, i) => sig(Math.log(p0[i] / (1 - p0[i])) + ((sch[r.team] || {}).eff || 0)));
      console.log(`  + school record K=${String(Kk).padEnd(3)}      AUC ${auc(ps, ys).toFixed(3)}  logloss ${logloss(ps, ys).toFixed(4)}`);
    }
  }
  const roomMean = +(rows.reduce((s, r) => s + Math.min(100, r.share), 0) / rows.length / 100).toFixed(3);
  const out = { v: 1, built: new Date().toISOString().slice(0, 10), classes, n: rows.length, K, roomMean, bands: BANDS, groups: GRP_LIST, names: NAMES, coef: {}, schools: {} };
  for (const [yk, y] of Object.entries(Y)) {
    const w = fitLogit(rows, y); out.coef[yk] = w.map(v => +v.toFixed(4));
    const sch = effects(rows, w, y, K);
    Object.entries(sch).forEach(([s, a]) => { const o = out.schools[s] || (out.schools[s] = [a.n, 0, 0, 0, 0]); if (yk === 'played') { o[1] = +a.eff.toFixed(3); o[3] = a.o; o[4] = +a.e.toFixed(1); } else o[2] = +a.eff.toFixed(3); });
    const ps = rows.map(r => sig(dot(feats(r), w))), idx = ps.map((_, i) => i).sort((a, b) => ps[a] - ps[b]);
    console.log(`\n${yk} calibration (by tenth):`, Array.from({ length: 10 }, (_, d) => { const g = idx.slice(Math.floor(d * idx.length / 10), Math.floor((d + 1) * idx.length / 10)); return `${Math.round(100 * g.reduce((s, i) => s + ps[i], 0) / g.length)}→${Math.round(100 * g.reduce((s, i) => s + y(rows[i]), 0) / g.length)}`; }).join('  '));
    console.log(NAMES.map((n, i) => `${n} ${w[i] >= 0 ? '+' : ''}${w[i].toFixed(2)}`).join('  '));
  }
  const top = Object.entries(out.schools).filter(([, v]) => v[0] >= 40).sort((a, b) => b[1][1] - a[1][1]);
  console.log('\nPlays freshmen most vs expected:', top.slice(0, 8).map(([s, v]) => `${s} ${v[3]}/${v[0]} (exp ${v[4]})`).join(', '));
  console.log('Least:', top.slice(-8).map(([s, v]) => `${s} ${v[3]}/${v[0]} (exp ${v[4]})`).join(', '));
  if (!process.env.DRY) fs.writeFileSync(process.env.OUTFILE || path.join(REPO, 'src/pxFreshmanModel.json'), JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
