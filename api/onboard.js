// api/onboard.js — athlete/recruit onboarding submissions (public endpoint,
// replaces the old sports app's positional writer).
//
// Every submission is appended verbatim to the `Onboarding` tab (audit trail,
// auto-created). Signed-athlete submissions (default) additionally merge into
// the roster: identity fields into the level tab, enrichment into AppData —
// written BY HEADER and only for fields the athlete actually submitted, so a
// submission can never stomp unrelated columns or resurrect stale data.
// Recruit submissions (form link with ?recruit=1) stop at the Onboarding tab —
// data is collected without the person ever touching the roster.
//
// Name matching is deterministic (exact normalized name + suffix + level
// guards, same rules the old app used). New signed athletes are created with
// Public unset, so staff reviews before they appear on the public site.
// ?dryRun=1 reports what would be written without writing.
const crypto = require('crypto');

const SHEET_ID = process.env.SPORTS_SHEET_ID;

function b64url(str) { return Buffer.from(str).toString('base64url'); }
async function getToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${sig}` }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Sheets auth failed');
  return data.access_token;
}
async function sheetGet(token, range) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (data.error) throw new Error(`Sheets read "${range}": ${data.error.code} ${data.error.message}`);
  return data;
}
async function sheetBatchUpdate(token, data) {
  if (!data.length) return;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets write: ${d.error.code} ${d.error.message}`);
}
async function sheetAppend(token, range, row) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets append: ${d.error.code} ${d.error.message}`);
}
function colLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
async function ensureTab(token, title, headers) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  const d = await r.json();
  if (d.error && !/already exists/i.test(d.error.message || '')) throw new Error(d.error.message);
  const head = await sheetGet(token, `'${title}'!1:1`);
  if (!(head.values && head.values[0] && head.values[0].some(c => String(c).trim()))) {
    await sheetBatchUpdate(token, [{ range: `'${title}'!A1`, values: [headers] }]);
  }
}

const ONBOARDING_HEADERS = ['submittedAt', 'type', 'name', 'level', 'position', 'schoolOrTeam', 'classOf',
  'jerseyNumber', 'birthday', 'hometown', 'address', 'instagram', 'twitter', 'tiktok',
  'shirt', 'hoodie', 'shorts', 'pants', 'shoes', 'gloves', 'gamingSystem',
  'musicArtists', 'interests', 'brandTargets'];

const normName = raw => String(raw || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const hasSuffix = raw => /\b(jr|sr|ii|iii|iv)$/.test(String(raw || '').toLowerCase().trim());
const joinList = v => Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v || '');

const BASE_TAB = { 'NFL': { tab: 'NFL', range: 'NFL!A:P' }, 'College': { tab: 'College', range: 'College!A:Q' }, 'High School': { tab: 'Highschool', range: 'Highschool!A:S' } };

// Header-based writes: only headers present in the sheet AND non-empty in the
// submission are touched.
function headerUpdates(tabTitle, sheetHeaders, rowNum, values) {
  const updates = [];
  sheetHeaders.forEach((h, i) => {
    const key = Object.keys(values).find(k => k.toLowerCase() === String(h || '').trim().toLowerCase());
    if (!key) return;
    const v = values[key];
    if (v === undefined || v === null || String(v).trim() === '') return;
    updates.push({ range: `'${tabTitle}'!${colLetter(i)}${rowNum}`, values: [[String(v)]] });
  });
  return updates;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SHEET_ID) return res.status(500).json({ error: 'Not configured' });

  try {
    const sub = req.body || {};
    if (!String(sub.name || '').trim()) return res.status(400).json({ error: 'Name is required' });
    const dryRun = ['1', 'true'].includes(String((req.query || {}).dryRun || ''));
    const isRecruit = !!sub.recruit;
    const level = ['NFL', 'College', 'High School'].includes(sub.level) ? sub.level : 'College';
    const token = await getToken();

    // 1) Audit trail: every submission lands in the Onboarding tab.
    await ensureTab(token, 'Onboarding', ONBOARDING_HEADERS);
    const logRow = ONBOARDING_HEADERS.map(h => {
      if (h === 'submittedAt') return new Date().toISOString();
      if (h === 'type') return isRecruit ? 'recruit' : 'signed';
      if (h === 'brandTargets') return joinList(sub.brands);
      if (h === 'musicArtists' || h === 'interests') return joinList(sub[h]);
      return String(sub[h] ?? '');
    });
    if (!dryRun) await sheetAppend(token, "'Onboarding'!A:X", logRow);

    // 2) Recruits stop here — no roster writes at all.
    if (isRecruit) return res.json({ success: true, isNew: false, recruit: true, dryRun });

    // 3) Signed athletes: match against the level tab (exact name + suffix guard).
    const base = BASE_TAB[level];
    const baseData = await sheetGet(token, base.range);
    const baseRows = baseData.values || [];
    const baseHeaders = (baseRows[0] || []).map(h => String(h || '').trim());
    const nameIdx = baseHeaders.findIndex(h => h.toLowerCase() === 'name');
    if (nameIdx < 0) throw new Error(`${base.tab} tab has no Name column`);
    const subNorm = normName(sub.name);
    let matchRow = 0, matchedName = null;
    baseRows.forEach((r, i) => {
      if (i === 0 || matchRow) return;
      const candidate = String(r[nameIdx] || '').trim();
      if (normName(candidate) === subNorm && hasSuffix(candidate) === hasSuffix(sub.name)) {
        matchRow = i + 1; matchedName = candidate;
      }
    });

    // Values for the level tab (identity + gifting — the columns those tabs own).
    const baseVals = {
      'Name': matchedName || sub.name.trim(),
      'Position': sub.position, 'Team': level === 'NFL' ? sub.schoolOrTeam : undefined,
      'School': level !== 'NFL' ? sub.schoolOrTeam : undefined,
      'Instagram': sub.instagram, 'Twitter': sub.twitter, 'TikTok': sub.tiktok, 'Tiktok': sub.tiktok,
      'Birthday': sub.birthday, 'Address': sub.address,
      'Shirt': sub.shirt, 'Hoodie': sub.hoodie, 'Shorts': sub.shorts, 'Pants': sub.pants,
      'Shoes': sub.shoes, 'Gloves': sub.gloves, 'Gaming System': sub.gamingSystem,
      'ClassOf': sub.classOf, 'Class Of': sub.classOf,
    };
    // Enrichment for AppData (by header, submitted fields only).
    const appVals = {
      'name': matchedName || sub.name.trim(), 'level': level,
      'hometown': sub.hometown, 'jerseyNumber': sub.jerseyNumber,
      'musicArtists': joinList(sub.musicArtists), 'interests': joinList(sub.interests),
      'brandTargets': joinList(sub.brands), 'tiktok': sub.tiktok,
      'college': level !== 'NFL' ? sub.schoolOrTeam : undefined,
      'onboardedAt': new Date().toISOString(),
    };

    const planned = { baseTab: base.tab, matched: !!matchRow, matchedName };
    if (!dryRun) {
      if (matchRow) {
        await sheetBatchUpdate(token, headerUpdates(base.tab, baseHeaders, matchRow, baseVals));
      } else {
        await sheetAppend(token, base.range, baseHeaders.map(h => {
          const key = Object.keys(baseVals).find(k => k.toLowerCase() === h.toLowerCase());
          return key && baseVals[key] !== undefined ? String(baseVals[key] ?? '') : '';
        }));
      }
      // AppData row: update by name, append if missing.
      const app = await sheetGet(token, 'AppData!A:AZ');
      const appRows = app.values || [];
      const appHeaders = (appRows[0] || []).map(h => String(h || '').trim());
      const appNameIdx = appHeaders.findIndex(h => h.toLowerCase() === 'name');
      let appRow = 0;
      appRows.forEach((r, i) => {
        if (i === 0 || appRow) return;
        if (normName(r[appNameIdx]) === normName(appVals.name)) appRow = i + 1;
      });
      if (appRow) {
        await sheetBatchUpdate(token, headerUpdates('AppData', appHeaders, appRow, appVals));
      } else {
        await sheetAppend(token, 'AppData!A:AZ', appHeaders.map(h => {
          const key = Object.keys(appVals).find(k => k.toLowerCase() === h.toLowerCase());
          return key && appVals[key] !== undefined ? String(appVals[key] ?? '') : '';
        }));
      }
    }

    // Kick off instant enrichment for the just-signed athlete in the background
    // (ESPN id/details, 247 discovery + photo, first follower counts) — so their
    // profile fills in within a minute or two instead of waiting for the
    // overnight crons. Single-athlete runs skip the history snapshots.
    if (!dryRun) {
      try {
        const base = 'https://www.milkandhoneyfamily.com';
        const key = encodeURIComponent(process.env.CRON_SECRET || '');
        const nm = encodeURIComponent(String(sub.name).trim());
        // Auth: mint a short-lived admin session cookie (AUTH_SECRET) so the
        // internal calls pass authorized() even when CRON_SECRET isn't set.
        const { sign, COOKIE } = require('../lib/auth');
        const tok = process.env.AUTH_SECRET
          ? sign({ role: 'admin', name: 'onboard-bot', exp: Math.floor(Date.now() / 1000) + 300 }, process.env.AUTH_SECRET)
          : '';
        const hdrs = tok ? { headers: { cookie: `${COOKIE}=${tok}` } } : {};
        const jobs = Promise.allSettled([
          fetch(`${base}/api/refresh-depth?task=all&name=${nm}&key=${key}`, hdrs),
          fetch(`${base}/api/refresh-socials?name=${nm}&platforms=ig,x,tiktok&key=${key}`, hdrs),
        ]);
        // ?debugEnrich=1: wait for the jobs and report their statuses (testing).
        if (['1', 'true'].includes(String((req.query || {}).debugEnrich || ''))) {
          const settled = await jobs;
          const out = [];
          for (const s of settled) {
            if (s.status !== 'fulfilled') { out.push({ error: String(s.reason) }); continue; }
            let body = null;
            try { body = await s.value.json(); } catch { /* non-JSON */ }
            out.push({ status: s.value.status, body });
          }
          return res.json({ success: true, isNew: !matchRow, matchedName, dryRun, enrich: out });
        }
        let deferred = false;
        try { require('@vercel/functions').waitUntil(jobs); deferred = true; } catch { /* waitUntil unavailable */ }
        // Fallback: hold the response briefly so the jobs actually run.
        if (!deferred) await Promise.race([jobs, new Promise(r => setTimeout(r, 20000))]);
      } catch (e) { console.error('enrichment trigger failed:', e.message); }
    }

    return res.json({ success: true, isNew: !matchRow, matchedName, dryRun, planned: dryRun ? planned : undefined });
  } catch (err) {
    console.error('Onboard error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
