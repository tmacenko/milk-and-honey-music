// Coach stability model — the chance a head coach is gone within two years.
// For every FBS coach-season (cached season builds, 2020 on), features come
// from the app's own pxCoachFeatures (tenure, win %, Group of 5, SP+ vs.
// talent, SP+ trend); the outcome is whether the same coach was there one and
// two seasons later. Fits a logistic model, tests it on the latest seasons it
// didn't see, and writes src/pxCoachModel.json.
//
// Usage: node scripts/coach-model.js   (after scripts/team-fit-backtest.js
//   has cached the season builds; re-run each January after the coaching carousel)
const fs = require('fs'), path = require('path');
const L = require('./team-fit-backtest.js');
const pxCoachFeatures = L.fn('pxCoachFeatures'), pxCoachX = L.fn('pxCoachX');
const REPO = path.resolve(__dirname, '..');
const NAMES = ['int', 'yr1', 'yr2', 'yr6+', 'win<.35', 'win.35-.5', 'win.75+', 'G5', 'G5 winning', 'underperforms talent', 'SP+ decline'];
const sig = (z) => 1 / (1 + Math.exp(-z));
function fit(rows, lambda = 1) {
  const k = NAMES.length; let w = new Array(k).fill(0);
  for (let it = 0; it < 30; it++) {
    const H = Array.from({ length: k }, () => new Array(k).fill(0)), g = new Array(k).fill(0);
    rows.forEach(r => { const p = sig(r.x.reduce((s, v, i) => s + v * w[i], 0)); for (let a = 0; a < k; a++) { g[a] += (r.y - p) * r.x[a]; for (let b = 0; b < k; b++) H[a][b] += p * (1 - p) * r.x[a] * r.x[b]; } });
    for (let a = 1; a < k; a++) { H[a][a] += lambda; g[a] -= lambda * w[a]; }
    const M = H.map((r, i) => [...r, g[i]]);
    for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let q = c; q <= k; q++) M[r][q] -= f * M[c][q]; } }
    w = w.map((v, i) => v + M[i][k] / M[i][i]);
  }
  return w;
}
const auc = (ps, ys) => { let s = 0, np = 0; ps.forEach((a, i) => { if (!ys[i]) return; np++; ps.forEach((b, j) => { if (!ys[j]) s += a > b ? 1 : a === b ? 0.5 : 0; }); }); return s / np / ys.filter(y => !y).length; };

(async () => {
  const seasons = fs.readdirSync(L.STORE).map(f => (f.match(/^build-(\d{4})\.json$/) || [])[1]).filter(Boolean).map(Number).sort();
  const B = {};
  for (const y of seasons) B[y] = await L.built(y);
  const cur = path.join(L.STORE, `current-${seasons[seasons.length - 1] + 1}.json`);
  if (fs.existsSync(cur)) B[seasons[seasons.length - 1] + 1] = L.parse(JSON.parse(fs.readFileSync(cur, 'utf8')));
  const rows = [];
  for (const y of seasons) {
    if (!B[y + 2]) continue; // need two seasons of outcome
    Object.values(B[y].teamInfo).forEach(t => {
      if (!['P4', 'G5'].includes(t.tier)) return;
      const f = pxCoachFeatures(B[y], t); if (!f) return;
      const c1 = (B[y + 1].teamInfo[t.name] || {}).coach, c2 = (B[y + 2].teamInfo[t.name] || {}).coach;
      if (!c1 || !c2) return;
      rows.push({ y, team: t.name, x: pxCoachX(f), y2: c1 !== t.coach || c2 !== t.coach ? 1 : 0 });
    });
  }
  rows.forEach(r => { r.y = r.y; r.yv = r.y2; });
  const yrs = [...new Set(rows.map(r => r.y))].sort(), test = yrs.slice(-2);
  const tr = rows.filter(r => !test.includes(r.y)).map(r => ({ x: r.x, y: r.yv })), te = rows.filter(r => test.includes(r.y));
  const w0 = fit(tr);
  const ps = te.map(r => sig(r.x.reduce((s, v, i) => s + v * w0[i], 0)));
  console.log(`coach-seasons ${rows.length} (${yrs.join(',')}), new HC within 2 yrs: ${Math.round(100 * rows.filter(r => r.yv).length / rows.length)}%`);
  console.log(`holdout ${test.join(',')}: AUC ${auc(ps, te.map(r => r.yv)).toFixed(3)} (n ${te.length})`);
  const w = fit(rows.map(r => ({ x: r.x, y: r.yv })));
  console.log(NAMES.map((n, i) => `${n} ${w[i] >= 0 ? '+' : ''}${w[i].toFixed(2)}`).join('  '));
  const P = rows.map(r => sig(r.x.reduce((s, v, i) => s + v * w[i], 0))), idx = P.map((_, i) => i).sort((a, b) => P[a] - P[b]);
  console.log('calibration (predicted → actual, by fifth):', Array.from({ length: 5 }, (_, d) => { const g = idx.slice(Math.floor(d * idx.length / 5), Math.floor((d + 1) * idx.length / 5)); return `${Math.round(100 * g.reduce((s, i) => s + P[i], 0) / g.length)}→${Math.round(100 * g.filter(i => rows[i].yv).length / g.length)}`; }).join('  '));
  fs.writeFileSync(path.join(REPO, 'src/pxCoachModel.json'), JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), seasons: yrs, n: rows.length, names: NAMES, coef: w.map(v => +v.toFixed(3)) }));
})().catch(e => { console.error(e); process.exit(1); });
