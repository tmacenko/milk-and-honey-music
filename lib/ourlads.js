// Ourlads depth charts — shared by the nightly client sync
// (api/refresh-depth.js: our clients' depth rank) and the prospect data build
// (lib/prospects.js: every FBS team's chart, for Team Fit and team pages).
// Ourlads serves plain HTML and doesn't need the residential proxy.

const COLLEGE_INDEX_URL = 'https://www.ourlads.com/ncaa-football-depth-charts/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Our / CollegeFootballData school names → Ourlads index names (after the
// same normalization collegeUrlFor applies).
const COLLEGE_ALIASES = {
  'usf': 'south florida', 'usc': 'southern california', 'ole miss': 'mississippi',
  'pitt': 'pittsburgh', 'lsu': 'lsu', 'tcu': 'tcu', 'smu': 'smu', 'byu': 'byu',
  'ucf': 'central florida', 'miami': 'miami fl', 'uconn': 'connecticut',
  'app state': 'appalachian state', 'nc state': 'north carolina state',
  'ul monroe': 'louisianamonroe', 'miami oh': 'miami ohio',
};

// Normalized person key: "KELCE, TRAVIS 13/3", "Henry Jr., Chris RS FR" and
// our "Chris Henry Jr" all reduce to the same string. Trailing class tokens
// (FR/SO/JR/SR/GR) are ambiguous with name suffixes, but that's harmless —
// Jr/Sr suffixes are stripped in the final normalize anyway.
function nameKey(raw) {
  let s = String(raw || '').replace(/&[a-z#0-9]+;/gi, ' ').trim();
  // Ourlads appends acquisition/draft codes after names — "13/3", "CF23",
  // "U/Was", "T/SF", "W/KC" — all contain a digit or slash, names never do.
  s = s.replace(/(\s+[^\s]*[\d/][^\s]*)+\s*$/, '');
  // College class/status tokens, possibly stacked ("RS FR", or the "RS" left
  // over after a transfer tag like "RS JR/TR" loses its slash part above).
  s = s.replace(/(\s+(RS|FR|SO|JR|SR|GR|TR|HS)\.?)+\s*$/i, '');
  const parts = s.split(',');
  if (parts.length >= 2) s = `${parts.slice(1).join(' ')} ${parts[0]}`;
  return s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
}

// Parse an Ourlads depth chart page -> { nameKey: { rank, pos } }: each
// player's best rank across the rows read (skipST leaves out special teams).
const SPECIAL_TEAMS = /^(PR|KR|PT|PK|LS|H|K|P|KO|KOS)$/i;
function parseRows(html, skipST) {
  const out = {};
  const rows = String(html).split(/<tr[^>]*>/i).slice(1);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 3) continue;
    const pos = cells[0].replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '').trim();
    if (!pos || pos.length > 8) continue;
    if (skipST && SPECIAL_TEAMS.test(pos)) continue;
    let rank = 0;
    for (let i = 1; i + 1 < cells.length; i += 2) {
      const m = cells[i + 1].match(/<a[^>]*>([^<]+)<\/a>/);
      if (!m || !m[1].trim()) continue;
      rank++;
      const k = nameKey(m[1]);
      if (k && !(out[k] && out[k].rank <= rank)) out[k] = { rank, pos };
    }
  }
  return out;
}
// The client sync's view: special teams included.
const parseDepthChart = (html) => parseRows(html, false);
// Team Fit's view: a returner/kicker spot doesn't make a backup receiver a
// starter, so special-teams rows count only for players with no other spot.
function parseDepthForFit(html) {
  const main = parseRows(html, true);
  Object.entries(parseRows(html, false)).forEach(([k, v]) => { if (!main[k]) main[k] = v; });
  return main;
}

// College index -> normalized school name -> depth chart URL.
function parseCollegeIndex(html) {
  const map = {};
  const re = /alt='([^']+)'[^>]*class='nfl-dc-mm-logo'[\s\S]*?href='(depth-chart\.aspx\?s=[^']+)'/g;
  let m;
  while ((m = re.exec(html))) {
    const key = m[1].toLowerCase().replace(/[^a-z ]/g, '').trim();
    map[key] = COLLEGE_INDEX_URL + m[2].replace(/&amp;/g, '&');
  }
  return map;
}
function collegeUrlFor(map, school) {
  let key = String(school || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\buniversity\b|\bcollege\b/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (map[key]) return map[key];                 // exact Ourlads name first (e.g. "USC")
  if (COLLEGE_ALIASES[key] && map[COLLEGE_ALIASES[key]]) return map[COLLEGE_ALIASES[key]];
  const hit = Object.keys(map).find(k => k === key || k.startsWith(key + ' ') || key.startsWith(k + ' '));
  return hit ? map[hit] : null;
}

async function getHtml(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

// Every listed school's chart → { school: { nameKey: [rank, pos] } } for the
// given school names (our names; unmatched schools are skipped). Polite: a
// few pages at a time, stops at the deadline.
async function fetchCollegeDepth(schools, { deadline = Date.now() + 60000, concurrency = 4 } = {}) {
  const index = parseCollegeIndex(await getHtml(COLLEGE_INDEX_URL));
  const jobs = schools.map(s => [s, collegeUrlFor(index, s)]).filter(([, u]) => u);
  const out = {};
  let i = 0, errors = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < jobs.length && Date.now() < deadline) {
      const [school, url] = jobs[i++];
      try {
        const chart = parseDepthForFit(await getHtml(url));
        const t = {};
        Object.entries(chart).forEach(([k, v]) => { t[k] = [v.rank, v.pos]; });
        if (Object.keys(t).length) out[school] = t;
      } catch { errors++; }
    }
  }));
  return { teams: out, requested: jobs.length, fetched: Object.keys(out).length, errors };
}

module.exports = { COLLEGE_ALIASES, nameKey, parseDepthChart, parseDepthForFit, parseCollegeIndex, collegeUrlFor, fetchCollegeDepth };
