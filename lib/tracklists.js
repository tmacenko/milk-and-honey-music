// 1001Tracklists chart harvester (music dashboard module).
//
// Reads only public pages the site's robots.txt allows: the homepage (its
// three DJ-set charts are server-rendered) and the standalone chart pages
// for the four track charts. The homepage's tab switcher loads its other
// tabs from /action/, which robots.txt disallows — deliberately not used.
// One refresh = 5 page loads; callers cache the result for hours.
const BASE = 'https://www.1001tracklists.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const MARKS = { uml: '\u0308', acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', ring: '\u030A', cedil: '\u0327', caron: '\u030C' };
const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', ndash: '–', mdash: '—', hellip: '…', sdot: '·', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return String(s || '')
    .replace(/&([A-Za-z])(uml|acute|grave|circ|tilde|ring|cedil|caron);/g, (_, l, m) => (l + MARKS[m]).normalize('NFC'))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([A-Za-z]+);/g, (m, n) => (n in NAMED ? NAMED[n] : m));
}
const text = (html) => decode(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const abs = (href) => (href && href.startsWith('/') ? BASE + href : href || '');

// Split "Artist - Title" / "DJ @ Event" on the first separator.
function splitPair(s, seps) {
  for (const sep of seps) {
    const i = s.indexOf(sep);
    if (i > 0) return [s.slice(0, i).trim(), s.slice(i + sep.length).trim()];
  }
  return ['', s];
}

// Track chart pages (/charts/weekly, /charts/trending, /charts/mostheard,
// /charts/daily/…/newcomer): one `bItm oItm` block per ranked track.
function parseTrackChart(html, limit = 20) {
  const blocks = String(html || '').split(/<div class="bItm oItm[^"]*"/).slice(1);
  const rows = [];
  for (const raw of blocks) {
    const b = raw.split('<div class="iRow')[0];
    const link = b.match(/<div class="fontL">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const full = text(link[2]);
    const [artist, title] = splitPair(full, [' - ']);
    const moveRaw = text((b.match(/class="bRank">\s*\d+\s*<\/div>\s*<div class="(?:greenTxt|redTxt|blueTxt)">([\s\S]*?)<\/div>/) || [])[1]);
    const move = /new/i.test(moveRaw) ? 'new' : /^[+-]\d+$/.test(moveRaw) ? moveRaw : '';
    rows.push({
      rank: parseInt((b.match(/class="bRank">\s*(\d+)/) || [])[1], 10) || rows.length + 1,
      artist, title, full,
      url: abs(link[1]),
      art: (b.match(/class="artM"[^>]*?data-src="([^"]+)"/) || [])[1] || '',
      labels: [...b.matchAll(/class="trackLabel[^"]*">\s*<a[^>]*>([\s\S]*?)<\/a>/g)].map(m => text(m[1])).filter(Boolean),
      djs: parseInt(String((b.match(/playC[\s\S]*?<span>([\d,]+)<\/span>/) || [])[1] || '').replace(/,/g, ''), 10) || 0,
      move,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

// Homepage DJ-set charts live in <details><summary>Label</summary>…</details>.
function parseSetSection(html, label, limit = 10) {
  const s = String(html || '');
  const m = s.match(new RegExp('<summary>\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*</summary>([\\s\\S]*?)</details>', 'i'));
  if (!m) return { period: '', rows: [] };
  const sec = m[1];
  const period = text((sec.match(/<div class="h">([\s\S]*?)<\/div>/) || [])[1]);
  const rows = [];
  for (const raw of sec.split(/<div class="wRow f[^"]*"/).slice(1)) {
    const a = raw.match(/<a href="(\/tracklist\/[^"]+)"[^>]*class="fontM"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const full = text(a[2]);
    const [dj, event] = full.includes(' @ ') ? splitPair(full, [' @ ']) : splitPair(full, [' - ']);
    rows.push({
      rank: parseInt((raw.match(/class="bRank[^"]*">\s*(\d+)/) || [])[1], 10) || rows.length + 1,
      dj, event, full,
      url: abs(a[1]),
      views: text((raw.match(/title="tracklist views">[\s\S]*?<\/i>([\s\S]*?)<\/div>/) || [])[1]),
      date: ((raw.match(/title="tracklist date">[\s\S]*?(\d{4}-\d{2}-\d{2})/) || [])[1]) || '',
    });
    if (rows.length >= limit) break;
  }
  return { period, rows };
}

async function getPage(path) {
  const r = await fetch(BASE + path, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.text();
}

// Full refresh. `prev` (last good result) backfills any chart whose page
// failed this time, so one flaky page never blanks a column.
async function harvestCharts(prev) {
  const old = (prev && prev.charts) || {};
  const home = await getPage('/');
  const ncPath = (home.match(/href="(\/charts\/daily\/\d{4}\/\d{2}\/\d{2}\/newcomer\.html)"/) || [])[1] || '';
  const pages = { top: '/charts/weekly/index.html', trending: '/charts/trending/index.html', heard: '/charts/mostheard/index.html', newcomer: ncPath };
  const keys = Object.keys(pages);
  const got = await Promise.allSettled(keys.map(k => (pages[k] ? getPage(pages[k]) : Promise.reject(new Error('no link')))));
  const charts = {};
  const errors = [];
  keys.forEach((k, i) => {
    const rows = got[i].status === 'fulfilled' ? parseTrackChart(got[i].value) : [];
    if (rows.length) charts[k] = { rows, url: BASE + pages[k] };
    else { if (old[k]) charts[k] = old[k]; errors.push(`${k}: ${got[i].reason?.message || 'no rows parsed'}`); }
  });
  for (const [k, label] of [['viewed', 'Most Viewed Tracklists'], ['liked', 'Most Liked Tracklists'], ['premium', 'Latest Premium Audio Livesets']]) {
    const sec = parseSetSection(home, label);
    if (sec.rows.length) charts[k] = { ...sec, url: BASE + '/' };
    else { if (old[k]) charts[k] = old[k]; errors.push(`${k}: no rows parsed`); }
  }
  return { ts: Date.now(), charts, errors };
}

module.exports = { harvestCharts, parseTrackChart, parseSetSection };
