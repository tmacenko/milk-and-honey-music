// NFL development model — does a school put players in the draft beyond what
// its talent predicts? Picks in draft Y are expected from the school's
// average 247 team talent over seasons Y-4..Y-1 (one national Poisson curve
// fit on every school-year). A school's record = actual vs. expected picks
// over the last eight drafts, all positions, shrunk toward "in line" by K
// expected picks. Holdout tests (three splits, 2019–26) chose K 20–40: the
// effect is real but modest; same-position records are too thin to use.
//
// Usage: node scripts/draft-model.js
//   needs CFBD_API_KEY in .env; caches talent + drafts in .backtest-cache/.
//   Writes src/pxDraftModel.json. Re-run each May after the draft.
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const C = path.join(REPO, '.backtest-cache');
const env = fs.readFileSync(path.join(REPO, '.env'), 'utf8');
const KEY = process.env.CFBD_API_KEY || (env.match(/^CFBD_API_KEY=(.*)$/m) || [])[1];
const K = Number(process.env.K || 30);
const LAST = Number(process.env.LAST || new Date().getFullYear() - (new Date().getMonth() < 4 ? 1 : 0)); // last finished draft
const FIRST = LAST - 7;
const groupOf = (pos) => {
  const p = String(pos || '').toUpperCase();
  if (['QB'].includes(p)) return 'QB'; if (['RB', 'FB'].includes(p)) return 'RB'; if (p === 'WR') return 'WR'; if (p === 'TE') return 'TE';
  if (['OT', 'OG', 'C', 'OL', 'G', 'T'].includes(p)) return 'OL'; if (['DE', 'DT', 'DL', 'NT', 'EDGE'].includes(p)) return 'DL';
  if (['LB', 'ILB', 'OLB'].includes(p)) return 'LB'; if (['CB', 'S', 'DB', 'FS', 'SS', 'SAF'].includes(p)) return 'DB'; return '';
};
const cfbd = async (u) => { const r = await fetch(`https://api.collegefootballdata.com${u}`, { headers: { Authorization: `Bearer ${KEY}` } }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };
const cached = async (f, get) => { const p = path.join(C, f); try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { const v = await get(); fs.writeFileSync(p, JSON.stringify(v)); return v; } };

(async () => {
  fs.mkdirSync(path.join(C, 'talent'), { recursive: true });
  const T = {};
  for (let y = FIRST - 4; y < LAST; y++) {
    const l = await cached(`talent/${y}.json`, () => cfbd(`/talent?year=${y}`));
    T[y] = {}; l.forEach(t => { T[y][t.team] = parseFloat(t.talent); });
  }
  const D = {};
  for (let y = FIRST; y <= LAST; y++) {
    D[y] = await cached(`prospects-draft-${y}.json`, async () => {
      const d = {}; (await cfbd(`/draft/picks?year=${y}`)).forEach(p => { const g = groupOf(p.position); if (!p.collegeTeam || !g) return; const o = d[p.collegeTeam] || (d[p.collegeTeam] = {}); o[g] = (o[g] || 0) + 1; }); return d;
    });
  }
  const rows = [];
  for (let y = FIRST; y <= LAST; y++) {
    Object.keys(T[y - 1] || {}).forEach(s => {
      const ts = [1, 2, 3, 4].map(k => (T[y - k] || {})[s]).filter(Boolean);
      if (ts.length < 3) return;
      rows.push({ y, s, t: ts.reduce((a, b) => a + b, 0) / ts.length, n: Object.values(D[y][s] || {}).reduce((a, b) => a + b, 0) });
    });
  }
  // Poisson: picks ~ exp(a + b·z + c·z²), z = (talent − 600) / 200.
  const X = (t) => { const z = (t - 600) / 200; return [1, z, z * z]; };
  let w = [0, 0, 0];
  for (let it = 0; it < 60; it++) {
    const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    rows.forEach(r => { const x = X(r.t), mu = Math.exp(x[0] * w[0] + x[1] * w[1] + x[2] * w[2]); for (let a = 0; a < 3; a++) { g[a] += (r.n - mu) * x[a]; for (let b = 0; b < 3; b++) H[a][b] += mu * x[a] * x[b]; } });
    const M = H.map((r, i) => [...r, g[i]]);
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= 3; k++) M[r][k] -= f * M[c][k]; }
    w = w.map((v, i) => v + M[i][3] / M[i][i]);
  }
  const mu = (t) => { const x = X(t); return Math.exp(x[0] * w[0] + x[1] * w[1] + x[2] * w[2]); };
  const sch = {};
  rows.forEach(r => { const a = sch[r.s] || (sch[r.s] = [0, 0]); a[0] += r.n; a[1] += mu(r.t); });
  const out = { v: 1, built: new Date().toISOString().slice(0, 10), drafts: [FIRST, LAST], K, schools: {} };
  Object.entries(sch).forEach(([s, [o, e]]) => { out.schools[s] = [o, +e.toFixed(1)]; });
  const rank = Object.entries(out.schools).filter(([, [, e]]) => e >= 5).map(([s, [o, e]]) => [s, (o + K) / (e + K), o, e]).sort((a, b) => b[1] - a[1]);
  console.log(`school-years ${rows.length}, drafts ${FIRST}–${LAST}, K=${K}`);
  console.log('Expected picks / yr at talent 500, 700, 900:', [500, 700, 900].map(t => mu(t).toFixed(2)).join(', '));
  console.log('Most above talent:', rank.slice(0, 10).map(([s, m, o, e]) => `${s} ${o}/${e.toFixed(0)} (${m.toFixed(2)}×)`).join(', '));
  console.log('Most below:', rank.slice(-10).map(([s, m, o, e]) => `${s} ${o}/${e.toFixed(0)} (${m.toFixed(2)}×)`).join(', '));
  fs.writeFileSync(path.join(REPO, 'src/pxDraftModel.json'), JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
