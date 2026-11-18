// api/nfl-pay.js — the NFL pay calendar the app needs to place game checks:
// which season we're in, the Tuesday of pay week 1, how many weeks have
// locked, and the practice-squad weekly rate. Staff sessions only.
//
// GET → { season, week1, week, weeks, psRate, locks: ['YYYY-MM-DD' × 18], paydays: [the Fridays] }
const { authState } = require('../lib/auth');
const nflPay = require('../lib/nfl-pay');

// ESPN's calendar is fetched once per warm instance per day.
let cache = { season: 0, week1: '', at: 0 };

module.exports = async (req, res) => {
  const { configured, admin } = authState(req);
  if (configured && !admin) return res.status(403).json({ error: 'Not authorized' });
  try {
    const now = new Date();
    const season = nflPay.seasonFor(now);
    if (cache.season !== season || now - cache.at > 86400000) {
      cache = { season, week1: await nflPay.week1Tuesday(season), at: now.getTime() };
    }
    const week1 = cache.week1;
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.json({
      season, week1, weeks: nflPay.WEEKS, week: nflPay.currentWeek(week1, now), psRate: nflPay.psRateFor(season),
      locks: Array.from({ length: nflPay.WEEKS }, (_, i) => nflPay.lockIso(week1, i + 1)),
      paydays: Array.from({ length: nflPay.WEEKS }, (_, i) => nflPay.payDayIso(week1, i + 1)),
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
