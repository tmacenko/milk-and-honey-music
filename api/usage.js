// Dashboard usage, person by person — visible to the owner only.
//
// POST (any signed-in staff session): the browser's batched activity —
//   { events: [{ t, ty: 'open'|'view'|'profile'|'tab', pg?, c?, tab? }], active }
//   (active = seconds of real, visible use since the last batch). Each batch
//   is its own encrypted blob (usage/raw/<UTC day>/…), so writes never race.
// GET ?days=30&tz=… (owner only): rolls finished days into one file each
//   (usage/day/<day>.enc.json), then returns per-person totals.
//
// Stored encrypted on Vercel Blob (lib/encstore) — not in the shared sheet,
// so nobody else can read it.
const crypto = require('crypto');
const { authState } = require('../lib/auth');
const { loadEnc, saveEnc, listBlobs, deleteBlobs } = require('../lib/encstore');

const OWNERS = String(process.env.USAGE_OWNERS || 'tyler@milkhoneyla.com').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const TYPES = new Set(['open', 'view', 'profile', 'tab']);
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

async function inBatches(items, n, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...await Promise.all(items.slice(i, i + n).map(fn)));
  return out;
}

module.exports = async (req, res) => {
  try {
    return await handle(req, res);
  } catch (e) {
    return res.status(500).json({ error: 'Usage is unavailable right now (' + e.message + ')' });
  }
};

async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.AUTH_SECRET;
  const st = authState(req);
  if (!secret || !st.admin) return res.status(401).json({ error: 'Not signed in' });

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const now = Date.now();
    const events = (Array.isArray(body && body.events) ? body.events : []).slice(0, 400)
      .filter(e => e && TYPES.has(e.ty) && Number.isFinite(e.t) && e.t > now - 3 * 86400000 && e.t < now + 60000)
      .map(e => ({ t: Math.round(e.t), ty: e.ty, pg: str(e.pg, 60), c: str(e.c, 80), tab: str(e.tab, 30) }));
    const active = Math.max(0, Math.min(3600, Math.round(+(body && body.active) || 0)));
    if (!events.length && !active) return res.json({ ok: true });
    const u = st.user ? { n: st.user.name, e: st.user.email || '', r: st.user.userRole || '' } : { n: 'House login', e: '', r: 'admin' };
    const path = `usage/raw/${utcDay(now)}/${now}-${crypto.randomBytes(4).toString('hex')}.enc.json`;
    await saveEnc(path, { u, events, active, at: now }, secret);
    return res.json({ ok: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const email = String((st.user && st.user.email) || '').toLowerCase();
  if (!OWNERS.includes(email)) return res.status(403).json({ error: 'Not authorized' });

  const days = Math.max(1, Math.min(120, parseInt(req.query.days, 10) || 30));
  let tz = String(req.query.tz || 'America/New_York');
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'America/New_York'; }
  const localDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const now = Date.now();
  const today = utcDay(now);
  const firstUtc = utcDay(now - (days + 1) * 86400000);

  // Roll finished days' batches into one file per day (a batch can only land
  // on its own UTC day, so a finished day never changes again).
  const [raw, dayFiles] = await Promise.all([listBlobs('usage/raw/'), listBlobs('usage/day/')]);
  const haveDay = new Set(dayFiles.map(b => b.pathname.slice(10, 20)));
  const rawByDay = {};
  raw.forEach(b => { const d = b.pathname.slice(10, 20); (rawByDay[d] = rawByDay[d] || []).push(b); });
  const loaded = {};
  let budget = 400;
  for (const d of Object.keys(rawByDay).sort()) {
    if (d >= today || budget <= 0) continue;
    const list = rawByDay[d].slice(0, budget);
    budget -= list.length;
    if (!haveDay.has(d) && list.length === rawByDay[d].length) {
      const items = (await inBatches(list, 25, b => loadEnc(b.pathname, secret))).filter(Boolean);
      await saveEnc(`usage/day/${d}.enc.json`, { items }, secret);
      haveDay.add(d);
      loaded[d] = items;
      await deleteBlobs(list.map(b => b.url));
      delete rawByDay[d];
    } else if (haveDay.has(d)) {
      // Already rolled up by an earlier request that got interrupted.
      await deleteBlobs(list.map(b => b.url));
      delete rawByDay[d];
    }
  }

  // Everything in range: day files + any batches not rolled up yet.
  const wantDays = [...haveDay].filter(d => d >= firstUtc && !loaded[d]);
  const dayItems = await inBatches(wantDays, 20, d => loadEnc(`usage/day/${d}.enc.json`, secret).then(x => (x && x.items) || []));
  const rawLeft = Object.entries(rawByDay).filter(([d]) => d >= firstUtc).flatMap(([, l]) => l);
  const rawItems = (await inBatches(rawLeft, 25, b => loadEnc(b.pathname, secret))).filter(Boolean);
  const items = [...Object.values(loaded).flat(), ...dayItems.flat(), ...rawItems];

  // Per person, per local day.
  const since = localDay(now - (days - 1) * 86400000);
  const people = {};
  for (const it of items) {
    if (!it || !it.u) continue;
    const key = (it.u.e || it.u.n || '?').toLowerCase();
    const P = people[key] || (people[key] = { name: it.u.n, email: it.u.e, role: it.u.r, byDay: {}, pages: {}, clients: {}, times: [], recent: [], last: 0 });
    const ad = localDay(it.at || now);
    if (ad >= since && it.active) { const D = P.byDay[ad] || (P.byDay[ad] = { active: 0, events: 0 }); D.active += it.active; }
    for (const e of it.events || []) {
      const d = localDay(e.t);
      if (d < since) continue;
      const D = P.byDay[d] || (P.byDay[d] = { active: 0, events: 0 });
      D.events++;
      P.times.push(e.t);
      if (e.t > P.last) P.last = e.t;
      const page = e.ty === 'view' ? e.pg : e.ty === 'profile' || e.ty === 'tab' ? `profile:${e.tab || 'overview'}` : '';
      if (page && e.ty !== 'open') P.pages[page] = (P.pages[page] || 0) + 1;
      if (e.ty === 'profile' && e.c) P.clients[e.c] = (P.clients[e.c] || 0) + 1;
      if (e.ty !== 'open') P.recent.push({ t: e.t, ty: e.ty, pg: e.pg, c: e.c, tab: e.tab });
    }
  }
  const users = Object.values(people).map(P => {
    const ts = P.times.sort((x, y) => x - y);
    let sessions = ts.length ? 1 : 0;
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 30 * 60000) sessions++;
    const top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n);
    return {
      name: P.name, email: P.email, role: P.role,
      byDay: P.byDay, sessions, last: P.last,
      active: Object.values(P.byDay).reduce((t, d) => t + d.active, 0),
      daysActive: Object.values(P.byDay).filter(d => d.active >= 60 || d.events >= 3).length,
      pages: top(P.pages, 12), clients: top(P.clients, 12),
      recent: P.recent.sort((x, y) => y.t - x.t).slice(0, 30),
    };
  }).filter(u => u.last || u.active);
  return res.json({ users, since, days, tz, generated: now });
}
