// Transfer outlook model — "at this school, how often do transfers like him
// play in year 1 and produce?" Three parts, each from real outcomes:
//   1. Players like him: logistic model on every past transfer (position,
//      production before the move, level step vs. his earned level, class).
//   2. Room: how much of the position's production was leaving that school.
//   3. School track record: how that school's transfers (ALL positions) did
//      vs. what the model expected for them — so a school isn't judged on
//      players it never had, and small samples stay near zero (shrinkage).
//
// Usage: node scripts/transfer-model.js
//   reads .backtest-cache/backtest-results.json (+ bt-2122.json if present)
//   from scripts/team-fit-backtest.js, validates out of sample, and writes
//   src/pxTransferModel.json (bundled into the app). Re-run once a year after
//   the season ends, when another transfer cycle has finished.
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const C = path.join(REPO, '.backtest-cache');
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(C, f), 'utf8')); } catch { return []; } };
const GROUPS = { QB: ['QB'], RB: ['RB', 'FB', 'APB'], WR: ['WR'], TE: ['TE'], DL: ['DL', 'DE', 'DT', 'NT', 'EDGE'], LB: ['LB', 'ILB', 'OLB'], DB: ['DB', 'CB', 'S', 'FS', 'SS'], ATH: ['ATH'] };
const grpOf = (pos) => Object.keys(GROUPS).find(g => GROUPS[g].includes(String(pos || '').toUpperCase())) || '';

// Feature bands (kept coarse so every cell has hundreds of players).
const BANDS = {
  prod: [[0, 1], [1, 40], [40, 60], [60, 80], [80, 101]], // 0 = no production record
  lv: [[-999, -20], [-20, -5], [-5, 10], [10, 25], [25, 999]], // destination level − earned level
  yr: [[0, 3], [3, 4], [4, 99]], // class before the move: FR/SO, JR, SR+
};
const GRP_LIST = ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'ATH'];
const bandOf = (k, v) => Math.max(0, BANDS[k].findIndex(([a, b]) => v >= a && v < b));
// One-hot design (first band of each = reference).
const NAMES = ['int', ...BANDS.prod.slice(1).map((_, i) => `prod${i + 1}`), ...BANDS.lv.slice(1).map((_, i) => `lv${i + 1}`),
  'room', ...(process.env.USE ? ['use'] : []), ...BANDS.yr.slice(1).map((_, i) => `yr${i + 1}`), ...GRP_LIST.slice(1)];
function feats(r) {
  const x = new Array(NAMES.length).fill(0); x[0] = 1;
  const set = (n) => { const i = NAMES.indexOf(n); if (i > 0) x[i] = 1; };
  set(`prod${bandOf('prod', r.prodBefore)}`); set(`lv${bandOf('lv', r.lvDiff)}`); x[NAMES.indexOf('room')] = Math.min(100, r.share || 0) / 100; if (process.env.USE) x[NAMES.indexOf('use')] = r.use == null ? 0.5 : r.use / 100; set(`yr${bandOf('yr', r.yr || 0)}`); set(r.grp);
  return x;
}
const sig = (z) => 1 / (1 + Math.exp(-z));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
function solve(A, b) { // Gaussian elimination
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function fitLogit(rows, y, lambda = 1) { // IRLS with a light ridge
  const X = rows.map(feats), k = NAMES.length;
  let w = new Array(k).fill(0);
  for (let it = 0; it < 25; it++) {
    const H = Array.from({ length: k }, () => new Array(k).fill(0)), g = new Array(k).fill(0);
    X.forEach((x, i) => { const p = sig(dot(x, w)), d = p * (1 - p); for (let a = 0; a < k; a++) { g[a] += (y(rows[i]) - p) * x[a]; if (!x[a]) continue; for (let b = 0; b < k; b++) H[a][b] += d * x[a] * x[b]; } });
    for (let a = 1; a < k; a++) { H[a][a] += lambda; g[a] -= lambda * w[a]; }
    const step = solve(H, g); w = w.map((v, i) => v + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return w;
}
// School effect on the log-odds scale: one Newton step from 0 with a
// Gaussian prior — Σ(actual − expected) / (Σ p(1−p) + K). K = how many
// "average" transfers of evidence a school needs before it moves.
function effects(rows, w, y, key, K) {
  const acc = {};
  rows.forEach(r => { const k = key(r); if (!k) return; const p = sig(dot(feats(r), w)); const a = acc[k] || (acc[k] = { n: 0, o: 0, e: 0, v: 0 }); a.n++; a.o += y(r); a.e += p; a.v += p * (1 - p); });
  const out = {}; Object.entries(acc).forEach(([k, a]) => { out[k] = { ...a, eff: (a.o - a.e) / (a.v + K) }; });
  return out;
}
function auc(ps, ys) {
  const pos = [], neg = []; ps.forEach((p, i) => (ys[i] ? pos : neg).push(p));
  let s = 0; const sn = [...neg].sort((a, b) => a - b);
  pos.forEach(p => { let lo = 0, hi = sn.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sn[m] < p) lo = m + 1; else hi = m; } let eq = lo; while (eq < sn.length && sn[eq] === p) eq++; s += lo + (eq - lo) / 2; });
  return s / (pos.length * neg.length);
}
const logloss = (ps, ys) => -ps.reduce((s, p, i) => s + (ys[i] ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9))), 0) / ps.length;

const all = [...load('bt-2122.json'), ...load('backtest-results.json')]
  .filter(r => r.found).map(r => ({ ...r, grp: grpOf(r.pos) })).filter(r => r.grp && (!process.env.OFFENSE || ['QB', 'RB', 'WR', 'TE'].includes(r.grp))); // OL has no production stats to judge
// Analysis switches: OFFENSE=1 (skill positions only), USE=1 (add how much
// the destination fed the position the season before), DRY=1 (don't write).
const Y = { played: (r) => (r.played ? 1 : 0), produced: (r) => (r.prodAfter >= 50 ? 1 : 0) };
const cycles = [...new Set(all.map(r => r.Y))].sort();
console.log(`transfers ${all.length} (OL excluded), cycles ${cycles.join(',')}`);

// ── Out-of-sample check: train on earlier cycles, test on a later one ──
const report = {};
for (const [yk, y] of Object.entries(Y)) {
  console.log(`\n== ${yk} ==`);
  const lines = {};
  for (const T of cycles.slice(2)) {
    const tr = all.filter(r => r.Y < T), te = all.filter(r => r.Y === T);
    const w = fitLogit(tr, y);
    const ys = te.map(y);
    const p0 = te.map(r => sig(dot(feats(r), w)));
    const add = (label, ps) => { (lines[label] = lines[label] || []).push([T, auc(ps, ys), logloss(ps, ys), te.length]); };
    const base = all.filter(r => r.Y < T).reduce((s, r) => s + y(r), 0) / tr.length;
    add('national average only', te.map(() => base));
    add('players like him (model)', p0);
    for (const K of [5, 10, 20, 40]) {
      const sch = effects(tr, w, y, r => r.to, K);
      add(`+ school record, all positions K=${K}`, te.map((r, i) => sig(Math.log(p0[i] / (1 - p0[i])) + ((sch[r.to] || {}).eff || 0))));
      const sg = effects(tr, w, y, r => `${r.to}|${r.grp}`, K);
      add(`+ school record, same position K=${K}`, te.map((r, i) => sig(Math.log(p0[i] / (1 - p0[i])) + ((sg[`${r.to}|${r.grp}`] || {}).eff || 0))));
    }
  }
  Object.entries(lines).forEach(([label, v]) => {
    const n = v.reduce((s, x) => s + x[3], 0);
    const a = v.reduce((s, x) => s + x[1] * x[3], 0) / n, l = v.reduce((s, x) => s + x[2] * x[3], 0) / n;
    console.log(`${label.padEnd(40)} AUC ${a.toFixed(3)}  logloss ${l.toFixed(4)}  (${v.map(x => x[0]).join(',')})`);
    (report[yk] = report[yk] || {})[label] = { auc: +a.toFixed(3), logloss: +l.toFixed(4) };
  });
}

// ── Final model on every cycle ──
const K = Number(process.env.K || 20);
// Room = share of the position's production leaving (0–1, one slope).
// "Similar players" (part 1) is shown at the average room, so part 2 is only
// what this school's room adds.
const roomMean = +(all.reduce((s, r) => s + Math.min(100, r.share || 0), 0) / all.length / 100).toFixed(3);
const out = { v: 1, roomMean, built: new Date().toISOString().slice(0, 10), cycles, n: all.length, K, bands: BANDS, groups: GRP_LIST, names: NAMES, coef: {}, schools: {}, check: report };
for (const [yk, y] of Object.entries(Y)) {
  const w = fitLogit(all, y);
  out.coef[yk] = w.map(v => +v.toFixed(4));
  const sch = effects(all, w, y, r => r.to, K);
  Object.entries(sch).forEach(([s, a]) => {
    const o = out.schools[s] || (out.schools[s] = [a.n, 0, 0, 0, 0]);
    // [transfers, played effect, produced effect, actual played, expected played]
    if (yk === 'played') { o[1] = +a.eff.toFixed(3); o[3] = a.o; o[4] = +a.e.toFixed(1); } else o[2] = +a.eff.toFixed(3);
  });
  // Calibration: predicted vs actual by decile.
  const ps = all.map(r => sig(dot(feats(r), w))), idx = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]);
  console.log(`\n${yk} calibration (predicted → actual, by tenth):`);
  console.log(Array.from({ length: 10 }, (_, d) => { const g = idx.slice(Math.floor(d * idx.length / 10), Math.floor((d + 1) * idx.length / 10)); return `${Math.round(100 * g.reduce((s, i) => s + ps[i], 0) / g.length)}→${Math.round(100 * g.reduce((s, i) => s + y(all[i]), 0) / g.length)}`; }).join('  '));
  console.log(NAMES.map((n, i) => `${n} ${w[i] >= 0 ? '+' : ''}${w[i].toFixed(2)}`).join('  '));
}
const top = Object.entries(out.schools).filter(([, v]) => v[0] >= 15).sort((a, b) => b[1][1] - a[1][1]);
console.log('\nPlays transfers most vs expected:', top.slice(0, 8).map(([s, v]) => `${s} ${v[3]}/${v[0]} (exp ${v[4]})`).join(', '));
console.log('Least:', top.slice(-8).map(([s, v]) => `${s} ${v[3]}/${v[0]} (exp ${v[4]})`).join(', '));
if (!process.env.DRY) fs.writeFileSync(path.join(REPO, 'src/pxTransferModel.json'), JSON.stringify(out));
