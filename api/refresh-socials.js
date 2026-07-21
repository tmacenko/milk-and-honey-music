// api/refresh-socials.js — daily auto-refresh of athlete follower counts.
//
// Replicates what a paid scraper service does, for free: pulls current
// Instagram / TikTok / X follower counts from each platform's own public
// endpoints and writes them back into the Sports AppData tab (igFollowers,
// twitterFollowers, tiktokFollowers). The site/PDFs/shares read those cells,
// so nothing else changes. Never blanks a value on failure — a missed fetch
// just leaves the last known number in place.
//
// The one real risk is Vercel's datacenter IPs getting throttled by Instagram/
// TikTok; the response reports per-platform success counts so we can see how
// they fare and, if needed, point just the troubled platform at a proxy later.
//
// Auth: admin cookie, or `Authorization: Bearer $CRON_SECRET` (what Vercel Cron
// sends when CRON_SECRET is set), or `?key=$CRON_SECRET` for manual runs.
const crypto = require('crypto');
const { authState } = require('../lib/auth');

const SHEET_ID = process.env.SPORTS_SHEET_ID;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// Public web bearer used by twitter.com itself for guest access.
const X_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const X_QID = process.env.X_QUERY_ID || 'sLVLhk0bGj3MVFEKTdax1w';
const X_FEATURES = JSON.stringify({
  hidden_profile_subscriptions_enabled: true, rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true, highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true, subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
});

// ── Google Sheets helpers ─────────────────────────────────────────────────────
function b64url(s) { return Buffer.from(s).toString('base64url'); }
async function getToken(scope) {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: key.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sign = crypto.createSign('RSA-SHA256'); sign.update(`${header}.${payload}`);
  const sig = sign.sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${sig}` }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Google auth failed');
  return d.access_token;
}
async function sheetGet(token, range) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets read "${range}": ${d.error.message}`);
  return d;
}
async function sheetBatchUpdate(token, data) {
  if (!data.length) return;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets write: ${d.error.message}`);
}
async function sheetAppendRows(token, range, rows) {
  if (!rows.length) return;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Sheets append: ${d.error.message}`);
}
function colLetter(n) { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function parseRows(data) {
  const rows = data?.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1).map(row => { const o = {}; headers.forEach((h, j) => { o[h] = String(row[j] ?? '').trim(); }); return o; }).filter(r => (r['Name'] || r['name'] || '').trim());
}
const handle = h => String(h || '').replace(/^@/, '').replace(/\/$/, '').trim();
function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) { const k = n / 1e3; return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K'; }
  return Math.round(n).toString();
}

// ── Platform fetchers (return a raw follower number, or null on any failure) ───
// Optional residential proxy — Instagram blocks Vercel's datacenter IPs (429 /
// stripped HTML) but works fine through a residential IP. Set env PROXY_URL
// (e.g. http://user:pass@host:port) and IG turns on with no code change.
let proxyDispatcher = null;
if (process.env.PROXY_URL) {
  try { const { ProxyAgent } = require('undici'); proxyDispatcher = new ProxyAgent(process.env.PROXY_URL); } catch { /* undici missing */ }
}
async function fetchIG(username) {
  // Exact count via IG's web-profile API. Datacenter IPs get 429'd; a proxy
  // (PROXY_URL) makes this succeed.
  try {
    const r = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: { 'x-ig-app-id': '936619743392459', 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      dispatcher: proxyDispatcher || undefined,
    });
    if (!r.ok) return null;
    const j = await r.json();
    const n = j?.data?.user?.edge_followed_by?.count;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}
async function fetchTikTok(username) {
  try {
    const r = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"followerCount":(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch { return null; }
}
async function getGuestToken() {
  try {
    const r = await fetch('https://api.twitter.com/1.1/guest/activate.json', { method: 'POST', headers: { Authorization: `Bearer ${X_BEARER}`, 'User-Agent': UA } });
    const j = await r.json();
    return j.guest_token || null;
  } catch { return null; }
}
async function fetchX(username, guestToken) {
  if (!guestToken) return null;
  try {
    const variables = JSON.stringify({ screen_name: username, withSafetyModeUserFields: true });
    const url = `https://api.twitter.com/graphql/${X_QID}/UserByScreenName?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(X_FEATURES)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${X_BEARER}`, 'x-guest-token': guestToken, 'User-Agent': UA } });
    if (!r.ok) return null;
    const j = await r.json();
    const n = j?.data?.user?.result?.legacy?.followers_count;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// Run tasks with bounded concurrency, stopping cleanly at the time deadline.
async function runTasks(tasks, concurrency, deadline) {
  let i = 0, done = 0, timedOut = false;
  async function worker() {
    while (i < tasks.length) {
      if (Date.now() > deadline) { timedOut = true; return; }
      const t = tasks[i++];
      await t();
      done++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return { done, timedOut };
}

function authorized(req) {
  const { configured, admin } = authState(req);
  if (!configured || admin) return true;
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if ((req.headers['authorization'] || '') === `Bearer ${secret}`) return true;
    if ((req.query.key || '') === secret) return true;
  }
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!SHEET_ID) return res.status(500).json({ error: 'SPORTS_SHEET_ID not set' });
  if (!authorized(req)) return res.status(403).json({ error: 'Not authorized' });

  const q = req.query || {};
  const dryRun = q.dryRun === '1' || q.dryRun === 'true';
  // Default platform set (the daily cron passes no ?platforms=): X and TikTok
  // run daily; Instagram only Mondays and Thursdays to keep proxy bandwidth
  // low — follower counts don't move enough day-to-day to need more. Explicit
  // ?platforms=ig still runs it any day (manual refreshes).
  const igDay = [1, 4].includes(new Date().getUTCDay());
  const only = q.platforms ? String(q.platforms).split(',').map(s => s.trim()) : ['tiktok', 'x', ...(igDay ? ['ig'] : [])];
  const limit = q.limit ? parseInt(q.limit, 10) : Infinity;
  const offset = q.offset ? parseInt(q.offset, 10) : 0;
  const deadline = Date.now() + 52000; // stay under the 60s function cap

  try {
    const token = await getToken('https://www.googleapis.com/auth/spreadsheets');
    const [nfl, col, hs, app, auto] = await Promise.all([
      sheetGet(token, 'NFL!A:P'), sheetGet(token, 'College!A:Q'),
      sheetGet(token, 'Highschool!A:S'), sheetGet(token, 'AppData!A:AZ'),
      sheetGet(token, "'AutoSync'!A:F"),
    ]);

    // Handles come from the base roster tabs (+ AppData tiktok fallback).
    const handles = {}; // nameLower -> { name, ig, tw, tk }
    [...parseRows(nfl), ...parseRows(col), ...parseRows(hs)].forEach(r => {
      const name = (r['Name'] || '').trim(); if (!name) return;
      handles[name.toLowerCase()] = {
        name, ig: handle(r['Instagram']), tw: handle(r['Twitter']),
        tk: handle(r['TikTok'] || r['Tiktok'] || ''),
      };
    });

    // TikTok handle fallback still lives in AppData.
    const appRows = app.values || [];
    const appHeaders = (appRows[0] || []).map(h => String(h || '').trim());
    const appNameCol = appHeaders.findIndex(h => h.toLowerCase() === 'name');
    const tkHandleCol = appHeaders.findIndex(h => h.toLowerCase() === 'tiktok');
    if (appNameCol >= 0 && tkHandleCol >= 0) {
      appRows.forEach((r, i) => {
        if (i === 0) return;
        const n = String(r[appNameCol] || '').toLowerCase().trim();
        const h = handle(r[tkHandleCol]);
        if (n && h && handles[n] && !handles[n].tk) handles[n].tk = h;
      });
    }

    // Write target is the AutoSync tab (robot-owned). Missing athletes get a
    // row appended so every roster name always has a write target.
    const rows = auto.values || [];
    const headers = (rows[0] || []).map(h => String(h || '').trim());
    const idx = n => headers.findIndex(h => h.toLowerCase() === n.toLowerCase());
    const nameCol = idx('name'), igCol = idx('igFollowers'), twCol = idx('twitterFollowers'), tkCol = idx('tiktokFollowers');
    if (nameCol < 0) return res.status(400).json({ error: 'AutoSync has no name column' });
    const rowByName = {};
    rows.forEach((r, i) => {
      if (i === 0) return;
      const n = String(r[nameCol] || '').toLowerCase().trim();
      if (n) rowByName[n] = { i };
    });
    const missing = Object.keys(handles).filter(n => !rowByName[n]).sort();
    if (missing.length && !dryRun) {
      await sheetAppendRows(token, "'AutoSync'!A:F", missing.map(n => headers.map((_, j) => j === nameCol ? handles[n].name : '')));
      missing.forEach((n, k) => { rowByName[n] = { i: rows.length + k }; });
    }

    let names = Object.keys(handles).filter(n => rowByName[n]);
    names.sort();
    names = names.slice(offset, offset + limit); // offset+Infinity → to the end

    const guestToken = only.includes('x') ? await getGuestToken() : null;
    const results = {}; // nameLower -> { ig, tw, tk }
    const stats = { ig: { ok: 0, fail: 0 }, tiktok: { ok: 0, fail: 0 }, x: { ok: 0, fail: 0 } };
    const tasks = [];
    for (const n of names) {
      const h = handles[n];
      results[n] = {};
      if (only.includes('ig') && h.ig) tasks.push(async () => { const v = await fetchIG(h.ig); if (v != null) { results[n].ig = v; stats.ig.ok++; } else stats.ig.fail++; });
      if (only.includes('tiktok') && h.tk) tasks.push(async () => { const v = await fetchTikTok(h.tk); if (v != null) { results[n].tk = v; stats.tiktok.ok++; } else stats.tiktok.fail++; });
      if (only.includes('x') && h.tw) tasks.push(async () => { const v = await fetchX(h.tw, guestToken); if (v != null) { results[n].tw = v; stats.x.ok++; } else stats.x.fail++; });
    }

    const run = await runTasks(tasks, 6, deadline);

    // Write successful numbers back to AutoSync (never blank on failure).
    const updates = [];
    for (const n of names) {
      const r = results[n], row = rowByName[n];
      if (!r || !row) continue;
      if (r.ig != null && igCol >= 0) updates.push({ range: `'AutoSync'!${colLetter(igCol)}${row.i + 1}`, values: [[formatNum(r.ig)]] });
      if (r.tw != null && twCol >= 0) updates.push({ range: `'AutoSync'!${colLetter(twCol)}${row.i + 1}`, values: [[formatNum(r.tw)]] });
      if (r.tk != null && tkCol >= 0) updates.push({ range: `'AutoSync'!${colLetter(tkCol)}${row.i + 1}`, values: [[formatNum(r.tk)]] });
    }
    if (!dryRun) await sheetBatchUpdate(token, updates);

    // A couple of samples so we can eyeball correctness.
    const sample = names.slice(0, 3).map(n => ({ name: handles[n].name, ig: results[n].ig, x: results[n].tw, tiktok: results[n].tk }));

    return res.json({
      success: true, dryRun, athletesProcessed: names.length, tasksRun: run.done,
      timedOut: run.timedOut, cellsWritten: dryRun ? 0 : updates.length,
      platforms: stats, guestTokenObtained: !!guestToken, sample,
    });
  } catch (err) {
    console.error('refresh-socials error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
