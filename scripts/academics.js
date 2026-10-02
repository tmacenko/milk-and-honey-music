// Academics data for Team Fit — two public sources, no judgment calls:
//   • NCAA Graduation Success Rate for FOOTBALL (web3.ncaa.org/aprsearch,
//     latest cohort) — how often that school's football players graduate;
//   • U.S. Dept. of Education College Scorecard — admission rate and average
//     SAT, i.e. how selective the university is.
//
// Usage: node scripts/academics.js
//   Raw pulls are cached in .backtest-cache/academics/ (delete to refresh).
//   SCORECARD_KEY env = an api.data.gov key (DEMO_KEY allows ~10 calls/hour;
//   schools under the bulk query's size cut are then looked up one by one).
//   Writes src/pxAcademics.json. Re-run once a year (NCAA posts each fall).
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const C = path.join(REPO, '.backtest-cache/academics');
fs.mkdirSync(C, { recursive: true });
const env = fs.readFileSync(path.join(REPO, '.env'), 'utf8');
const CFBD = (env.match(/^CFBD_API_KEY=(.*)$/m) || [])[1];
const SKEY = process.env.SCORECARD_KEY || 'DEMO_KEY';
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(C, f), 'utf8')); } catch { return null; } };
const write = (f, v) => fs.writeFileSync(path.join(C, f), JSON.stringify(v));
// NCAA names that don't follow "University of X" / "X University".
const NCAA_NAME = {"Tennessee Tech":"Tennessee Technological University","Fresno State":"California State University, Fresno","Air Force":"U.S. Air Force Academy","Penn State":"Pennsylvania State University","Massachusetts":"University of Massachusetts, Amherst","UCLA":"University of California, Los Angeles","Miami":"University of Miami (Florida)","Miami (OH)":"Miami University (Ohio)","Wisconsin":"University of Wisconsin-Madison","NC State":"North Carolina State University","UL Monroe":"University of Louisiana Monroe","Hawai'i":"University of Hawaii, Manoa","Rutgers":"Rutgers, The State University of New Jersey, New Brunswick","California":"University of California, Berkeley","Navy":"U.S. Naval Academy","USC":"University of Southern California","Southern Illinois":"Southern Illinois University at Carbondale","Georgia Tech":"Georgia Institute of Technology","Sacramento State":"California State University, Sacramento","Charlotte":"The University of North Carolina at Charlotte","San José State":"San Jose State University","Nevada":"University of Nevada, Reno","Ole Miss":"University of Mississippi","Nebraska":"University of Nebraska-Lincoln","SE Louisiana":"Southeastern Louisiana University","Chattanooga":"University of Tennessee at Chattanooga","Montana State":"Montana State University-Bozeman","Texas A&M":"Texas A&M University, College Station","Virginia Tech":"Virginia Polytechnic Institute and State University","Maryland":"University of Maryland, College Park","UAlbany":"University at Albany","Cal Poly":"California Polytechnic State University","Buffalo":"University at Buffalo, the State University of New York","Minnesota":"University of Minnesota, Twin Cities","Southern":"Southern University, Baton Rouge","St. Thomas (MN)":"University of St. Thomas (Minnesota)","Army":"U.S. Military Academy","Columbia":"Columbia University-Barnard College","Missouri":"University of Missouri, Columbia","South Carolina":"University of South Carolina, Columbia","Texas":"University of Texas at Austin","Arkansas":"University of Arkansas, Fayetteville","Indiana":"Indiana University, Bloomington","Illinois":"University of Illinois Urbana-Champaign","Tennessee":"University of Tennessee, Knoxville","Colorado":"University of Colorado Boulder","Louisiana":"University of Louisiana at Lafayette","LSU":"Louisiana State University","McNeese":"McNeese State University","Stephen F. Austin":"Stephen F. Austin State University","North Carolina":"University of North Carolina, Chapel Hill","Austin Peay":"Austin Peay State University","Nicholls":"Nicholls State University","North Carolina A&T":"North Carolina A&T State University"};
// Scorecard names that differ from the NCAA's.
const SC_NAME = {"Arizona State":"Arizona State University Campus Immersion","Cal Poly":"California Polytechnic State University-San Luis Obispo","Colorado State":"Colorado State University-Fort Collins","Columbia":"Columbia University in the City of New York","Florida A&M":"Florida Agricultural and Mechanical University","Kent State":"Kent State University at Kent","LSU":"Louisiana State University and Agricultural & Mechanical College","Miami (OH)":"Miami University-Oxford","Michigan":"University of Michigan-Ann Arbor","Missouri State":"Missouri State University-Springfield","NC State":"North Carolina State University at Raleigh","Northwestern State":"Northwestern State University of Louisiana","Oklahoma":"University of Oklahoma-Norman Campus","Pittsburgh":"University of Pittsburgh-Pittsburgh Campus","Rutgers":"Rutgers University-New Brunswick","Southern":"Southern University and A & M College","Tulane":"Tulane University of Louisiana","UT Rio Grande Valley":"The University of Texas Rio Grande Valley","Washington":"University of Washington-Seattle Campus"};
const SC_FIELDS = 'id,school.name,school.city,school.state,latest.admissions.admission_rate.overall,latest.admissions.sat_scores.average.overall,latest.student.size';
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/&/g, ' and ').replace(/\bu\.s\.|\bunited states\b/g, 'us')
  .replace(/\b(the|university|of|college|at|main campus|campus)\b/g, ' ').replace(/[^a-z]/g, '');

(async () => {
  let teams = read('cfbd-teams.json');
  if (!teams) { teams = await (await fetch('https://api.collegefootballdata.com/teams', { headers: { Authorization: `Bearer ${CFBD}` } })).json(); write('cfbd-teams.json', teams); }
  const tb = {}; teams.forEach(t => { tb[t.school] = t; });
  const ours = Object.keys(tb).filter(n => ['fbs', 'fcs'].includes(tb[n].classification));

  let gsr = read('gsr-mfb.json');
  if (!gsr) {
    const jar = []; const page = await fetch('https://web3.ncaa.org/aprsearch/gsrsearch');
    (page.headers.getSetCookie ? page.headers.getSetCookie() : []).forEach(c => jar.push(c.split(';')[0]));
    const tok = ((await page.text()).match(/name="_csrf" content="([^"]+)"/) || [])[1];
    const r = await fetch('https://web3.ncaa.org/aprsearch/gsrsearch', { method: 'POST', headers: { 'X-CSRF-TOKEN': tok, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.join('; ') },
      body: `schoolOrgId=&conferenceOrgId=&sportCode=MFB&cohortYear=&state=&_csrf=${encodeURIComponent(tok)}` });
    gsr = await r.json(); write('gsr-mfb.json', gsr);
  }
  const latest = Math.max(...gsr.map(r => r.cohortYear));
  const G = gsr.filter(r => r.cohortYear === latest);
  const gByNorm = {}, gByName = {}; G.forEach(r => { gByNorm[norm(r.orgName)] = r; gByName[r.orgName] = r; });

  const sc = [];
  for (let p = 0; ; p++) {
    let d = read(`scorecard-${p}.json`);
    if (!d) { d = await (await fetch(`https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${SKEY}&school.degrees_awarded.predominant=3&latest.student.size__range=2500..&per_page=100&page=${p}&fields=${SC_FIELDS}`)).json(); if (!d.results) { console.error('scorecard:', d.error || d); break; } write(`scorecard-${p}.json`, d); }
    sc.push(...d.results);
    if ((p + 1) * 100 >= d.metadata.total) break;
  }
  const extra = read('scorecard-extra.json') || {};
  const sByKey = {}, sByName = {};
  [...sc, ...Object.values(extra)].forEach(s => { if (!s) return; sByKey[`${norm(s['school.name'])}|${s['school.state']}`] = s; sByName[s['school.name']] = s; });

  const out = { v: 1, built: new Date().toISOString().slice(0, 10), gsrCohort: latest, schools: {} };
  const noGsr = [], noSc = [];
  for (const n of ours) {
    const t = tb[n], st = (t.location || {}).state;
    let g = NCAA_NAME[n] ? gByName[NCAA_NAME[n]] : null;
    if (!g) for (const c of [n, ...(t.alternateNames || []), `${n} University`, `University of ${n}`]) { const r = gByNorm[norm(c)]; if (r && r.state === st) { g = r; break; } }
    const org = g ? g.orgName : '';
    let s = SC_NAME[n] ? sByName[SC_NAME[n]] : sByKey[`${norm(org)}|${st}`] || sByKey[`${norm(n)}|${st}`] || sByKey[`${norm(`University of ${n}`)}|${st}`];
    if (!s && extra[n] !== undefined) s = extra[n];
    if (!s && !(n in extra) && SKEY && org) {
      // Small schools fall under the bulk query's size cut — look them up by name.
      const d = await (await fetch(`https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${SKEY}&school.name=${encodeURIComponent(org.replace(/\(.*?\)|,.*$/g, '').trim())}&school.state=${st}&fields=${SC_FIELDS}`)).json().catch(() => ({}));
      if (d.results) { s = d.results.sort((a, b) => (b['latest.student.size'] || 0) - (a['latest.student.size'] || 0))[0] || null; extra[n] = s; write('scorecard-extra.json', extra); }
    }
    if (!g) noGsr.push(n); if (!s) noSc.push(n);
    if (!g && !s) continue;
    const adm = s ? s['latest.admissions.admission_rate.overall'] : null, sat = s ? s['latest.admissions.sat_scores.average.overall'] : null;
    // [football GSR, admission rate %, average SAT]
    out.schools[n] = [g ? g.gsr : null, adm != null ? Math.round(adm * 1000) / 10 : null, sat || null];
  }
  console.log(`schools ${Object.keys(out.schools).length} of ${ours.length} · GSR cohort ${latest}`);
  console.log('No NCAA rate:', noGsr.join(', ') || '-');
  console.log('No Scorecard:', noSc.join(', ') || '-');
  fs.writeFileSync(path.join(REPO, 'src/pxAcademics.json'), JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
