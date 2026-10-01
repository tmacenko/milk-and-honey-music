// Data normalizers — every onboarding submission and edit-form save runs
// through these so the sheet stays consistent (hometown "City, ST", 6'1",
// MM/DD/YYYY, sizes, PS5/Xbox/PC, handles without @, tidy lists).
const STATES = { alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY','district of columbia':'DC' };
const ABBR = new Set(Object.values(STATES));
const titleCity = (c) => c.trim().replace(/\s+/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());
const CITY_FIX = { miam: 'Miami' };
function hometown(v) {
  let s = String(v || '').trim().replace(/\s+/g, ' ');
  if (!s) return s;
  s = s.replace(/^([^,]+)/, (c) => CITY_FIX[c.trim().toLowerCase()] || c);
  if (s === s.toLowerCase()) s = titleCity(s);
  // "City, Full State" / "City Full State" → "City, ST"
  for (const [name, ab] of Object.entries(STATES).sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`^(.+?)[,\\s]+${name}$`, 'i');
    const m = s.match(re);
    if (m && m[1].trim()) return `${titleCity(m[1])}, ${ab}`;
  }
  const m = s.match(/^(.+?)[,\s]+([A-Za-z]{2})\.?$/);
  if (m && ABBR.has(m[2].toUpperCase())) return `${titleCity(m[1])}, ${m[2].toUpperCase()}`;
  return s;
}
const hasState = (h) => /,\s*[A-Z]{2}$/.test(h);
function height(v) {
  const m = String(v || '').match(/^\s*(\d)\s*(?:'|’|ft|-|\s)\s*(\d{1,2})\s*(?:"|”|in)?\s*$/i);
  return m ? `${m[1]}'${m[2]}"` : String(v || '').trim();
}
function size(v) {
  const s = String(v || '').trim(); if (!s || s === '—') return s;
  const map = { small: 'S', medium: 'M', large: 'L', xxl: '2XL', xxxl: '3XL', 'x-large': 'XL', 'xx-large': '2XL' };
  return s.split('/').map(p => { const t = p.trim().toLowerCase(); return map[t] || t.toUpperCase(); }).join('/');
}
function gaming(v) {
  const s = String(v || '').trim(); if (!s || s === '—') return s;
  if (/play\s*station|ps\s*5|ps5|ps4|playstation/i.test(s)) return 'PS5';
  if (/xbox/i.test(s)) return 'Xbox';
  if (/^pc$/i.test(s)) return 'PC';
  if (/^none$/i.test(s)) return 'None';
  return s;
}
function birthday(v) {
  const s = String(v || '').trim(); if (!s || s === '—') return s;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}/${m[1]}`;
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (m) { const y = m[3].length === 2 ? (+m[3] > 30 ? '19' : '20') + m[3] : m[3]; return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`; }
  return s;
}
const handle = (v) => String(v || '').trim().replace(/^@+/, '').replace(/^https?:\/\/(www\.)?(instagram|x|twitter|tiktok)\.com\/@?/i, '').replace(/[/?].*$/, '');
// Lists: split on commas/slashes(;), trim, fix known typos, capitalize the
// first letter of all-lowercase items, drop exact duplicates.
const FIX = { addidas: 'Adidas', adidas: 'Adidas', nike: 'Nike', 'under anour': 'Under Armour', 'under amour': 'Under Armour', 'under armour': 'Under Armour', ua: 'Under Armour', 'body amour': 'BodyArmor', 'body armor': 'BodyArmor', bodyarmor: 'BodyArmor', gatorade: 'Gatorade', beats: 'Beats', jordan: 'Jordan', 'new balance': 'New Balance', gamin: 'Gaming', gaming: 'Gaming', 'video fames': 'Video games', 'morgan walkrn': 'Morgan Wallen', 'nba youngboy': 'NBA YoungBoy', 'nba young boy': 'NBA YoungBoy', 'nba young': 'NBA YoungBoy', 'young boy': 'NBA YoungBoy', 'j.cole': 'J. Cole', jcole: 'J. Cole', 'j cole': 'J. Cole', 'lil baby': 'Lil Baby', 'lil durk': 'Lil Durk', 'chick-fil-a': 'Chick-fil-A', 'dr pepper': 'Dr Pepper', 'dr. pepper': 'Dr Pepper', powerade: 'Powerade', apple: 'Apple', 'mental health awarness': 'Mental Health Awareness', mediation: 'Meditation' };
function list(v) {
  const s = String(v || '').trim(); if (!s) return s;
  if (s.length > 140 && !s.includes(',')) return s; // a sentence, not a list
  const parts = s.split(s.includes(',') ? /\s*[,;]\s*/ : /\s*[;]\s*|\s*\.\s+(?=[A-Z])/).map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
  const out = []; const seen = new Set();
  for (let p of parts) {
    const k = p.toLowerCase();
    p = FIX[k] || (p === p.toLowerCase() ? p.charAt(0).toUpperCase() + p.slice(1) : p);
    if (seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase()); out.push(p);
  }
  return out.join(', ');
}
function school(v) {
  return String(v || '').trim().replace(/\bSt\.?\s*(?=[A-Z])/g, 'St. ').replace(/Prepatory/g, 'Preparatory').replace(/\s+/g, ' ');
}
function address(v) {
  let s = String(v || '').trim(); if (!s) return s;
  s = s.replace(/\s*\n+\s*/g, ', ').replace(/\s+,/g, ',').replace(/,{2,}/g, ',').replace(/\s{2,}/g, ' ');
  for (const [name, ab] of Object.entries(STATES).sort((a, b) => b[0].length - a[0].length)) {
    s = s.replace(new RegExp(`,\\s*${name}(\\s+\\d{5})`, 'i'), `, ${ab}$1`).replace(new RegExp(`,\\s*${name}\\s*$`, 'i'), `, ${ab}`);
  }
  return s;
}
const phone = (v) => { const d = String(v || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(v || '').trim(); };
module.exports = { hometown, hasState, height, size, gaming, birthday, handle, list, school, address, phone, STATES };
