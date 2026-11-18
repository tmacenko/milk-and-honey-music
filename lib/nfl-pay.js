// lib/nfl-pay.js — NFL game-check math shared by the Tuesday pay-week cron
// (api/refresh-depth.js task=payweeks), the Spotrac cash sync, and the
// /api/nfl-pay calendar endpoint the app reads.
//
// Model: a player earns 1/18th of his weekly-paid money for every regular-
// season week he is on the roster at the Tuesday 4 PM ET lock. Weekly-paid
// money = base salary + roster bonus + workout bonus for the season (Spotrac's
// cash table). Signing, option and restructure bonuses are lumps paid at
// signing and tracked separately; incentives count toward the max only.
// Practice-squad weeks pay the CBA weekly minimum. Fines are ignored.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const WEEKS = 18;

// CBA practice-squad weekly minimum (two or fewer credited seasons), by
// season. Years not listed use the latest earlier figure.
const PS_WEEKLY = { 2025: 13000, 2026: 13750, 2027: 14500, 2030: 16750 };
const psRateFor = (season) => {
  const ys = Object.keys(PS_WEEKLY).map(Number).filter(y => y <= season).sort((a, b) => b - a);
  return PS_WEEKLY[ys[0]] || PS_WEEKLY[2026];
};

// Known Week 1 Tuesdays, used when ESPN's calendar is unreachable.
const WEEK1_FALLBACK = { 2026: '2026-09-08' };

// The season a date belongs to: January and February still settle the season
// that kicked off the previous September.
const seasonFor = (d = new Date()) => d.getUTCMonth() < 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();

// Tuesday of pay week 1 for a season, as 'YYYY-MM-DD'. ESPN's regular-season
// week windows run Wednesday to Tuesday, so Week 2's start minus eight days is
// the Tuesday before Week 1's games. Week 1's own window opens the Sunday
// before kickoff and is only used as a cross-check.
async function week1Tuesday(season) {
  let iso = WEEK1_FALLBACK[season] || '';
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&limit=1`, { headers: { 'User-Agent': UA } });
    const d = await r.json();
    const reg = ((((d.leagues || [])[0] || {}).calendar) || []).find(c => /regular season/i.test(c.label || ''));
    const entry = (n) => reg && (reg.entries || []).find(e => new RegExp(`^week ${n}$`, 'i').test(e.label || ''));
    const utcDate = (s) => { const x = new Date(s); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())); };
    const w2 = entry(2);
    if (w2 && w2.startDate) {
      const t = utcDate(w2.startDate); t.setUTCDate(t.getUTCDate() - 8);
      if (t.getUTCDay() === 2) iso = t.toISOString().slice(0, 10);
    }
    if (!iso) {
      const w1 = entry(1);
      if (w1 && w1.startDate) {
        const t = utcDate(w1.startDate);
        while (t.getUTCDay() !== 2) t.setUTCDate(t.getUTCDate() + 1);
        iso = t.toISOString().slice(0, 10);
      }
    }
  } catch { /* fall back to the table */ }
  if (!iso) throw new Error(`No NFL calendar for ${season}`);
  return iso;
}

// Roster-lock instant for pay week k: that week's Tuesday at 21:00Z, which is
// 4 PM ET in standard time and 5 PM in daylight time — always past the lock.
function lockOf(week1Iso, k) {
  const [y, m, d] = week1Iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7 * (k - 1), 21, 0, 0));
}
const lockIso = (week1Iso, k) => lockOf(week1Iso, k).toISOString().slice(0, 10);

// Pay weeks whose lock has passed (0 before the season, 18 once it's done).
function currentWeek(week1Iso, now = new Date()) {
  let w = 0;
  for (let k = 1; k <= WEEKS; k++) if (lockOf(week1Iso, k) <= now) w = k;
  return w;
}

// What one pay week earns from the roster status at the lock and the season's
// Spotrac cash row. amount null = on the roster but no Spotrac cash on file.
function payWeekAmount(status, cash, season) {
  const s = String(status || '').toLowerCase();
  if (/free agent|retired|inactive|released|waived|unsigned|^cut/.test(s)) return { amount: 0, note: '' };
  if (/practice/.test(s)) return { amount: psRateFor(season), note: 'Practice squad rate' };
  if (!cash) return { amount: null, note: 'No Spotrac cash data' };
  return { amount: Math.round(((cash.base || 0) + (cash.roster || 0) + (cash.workout || 0)) / WEEKS), note: '' };
}

// Spotrac player page → { [year]: { base, signing, roster, option, workout,
// restructure, incentives, total } } in whole dollars, from the active deal's
// cash table (the "Cash Total" breakdown, current and future years). Falls
// back to the career earnings table ("Annual cash") when the breakdown is
// missing. null when neither parses.
function parseSpotracCash(html) {
  const text = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const money = s => { const n = parseFloat(String(s || '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
  const COLS = [
    ['base', /^base/i], ['signing', /^signing( bonus)?$/i], ['roster', /roster bonus/i], ['option', /^option bonus$/i],
    ['workout', /^workout bonus$/i], ['restructure', /^restructure/i], ['incentives', /^incentives$/i], ['total', /^(cash total|annual cash)$/i],
  ];
  const found = [];
  for (const tm of String(html).matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const heads = [...tm[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => text(m[1]));
    const isBreakdown = heads.some(h => /^cash total$/i.test(h));
    if (!isBreakdown && !heads.some(h => /^annual cash$/i.test(h))) continue;
    const map = {};
    COLS.forEach(([k, re]) => { const i = heads.findIndex(h => re.test(h)); if (i >= 0) map[k] = i; });
    if (map.base == null || map.total == null) continue;
    const out = {};
    for (const rm of tm[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => text(m[1]));
      // The year cell can carry an injury icon whose markup survives the tag
      // strip ("2024 Injured List\">"), so match the leading year only.
      const ym = String(cells[0] || '').match(/^(20\d\d)\b/);
      if (!ym) continue;
      const row = {};
      for (const [k, i] of Object.entries(map)) row[k] = money(cells[i]);
      if (!row.base && !row.total) continue; // void years, blank past seasons
      // A traded player shows two rows for one year (the old team's dead-cash
      // line is tiny) — keep the one with the most cash.
      if (out[ym[1]] && out[ym[1]].total >= row.total) continue;
      out[ym[1]] = row;
    }
    if (Object.keys(out).length) found.push({ pri: isBreakdown ? 0 : 1, out });
  }
  found.sort((a, b) => a.pri - b.pri);
  return found.length ? found[0].out : null;
}

module.exports = { UA, WEEKS, PS_WEEKLY, psRateFor, seasonFor, week1Tuesday, lockOf, lockIso, currentWeek, payWeekAmount, parseSpotracCash };
