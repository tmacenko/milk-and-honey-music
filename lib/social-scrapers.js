// lib/social-scrapers.js — shared follower-count fetchers for the daily social
// syncs (sports api/refresh-socials.js + music api/refresh-music-socials.js).
// Each fetcher returns a raw follower number, or null on any failure — callers
// never blank a stored value on a miss.
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

// Optional residential proxy — Instagram blocks Vercel's datacenter IPs (429 /
// stripped HTML) but works fine through a residential IP. Set env PROXY_URL
// (e.g. http://user:pass@host:port) and IG turns on with no code change.
let proxyDispatcher = null, proxyFetch = null;
if (process.env.PROXY_URL) {
  // undici's own fetch must pair with its ProxyAgent (Node's built-in fetch
  // can reject dispatchers from a separately-installed undici).
  try { const u = require('undici'); proxyDispatcher = new u.ProxyAgent(process.env.PROXY_URL); proxyFetch = u.fetch; } catch { /* undici missing */ }
}

async function fetchIG(username) {
  // Path 1: the old web_profile_info API (deprecated by IG mid-2026 — kept in
  // case it revives). Path 2: the public profile page via the residential
  // proxy; the og:description meta carries "7.7M Followers, ...".
  const useProxy = proxyDispatcher && proxyFetch;
  const doFetch = useProxy ? proxyFetch : fetch;
  try {
    const r = await doFetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: { 'x-ig-app-id': '936619743392459', 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Origin': 'https://www.instagram.com', 'Referer': 'https://www.instagram.com/', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-site' },
      dispatcher: useProxy ? proxyDispatcher : undefined,
    });
    if (r.ok) {
      const j = await r.json();
      const n = j?.data?.user?.edge_followed_by?.count;
      if (Number.isFinite(n)) return n;
    }
  } catch { /* fall through to HTML */ }
  try {
    const r = await doFetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1' },
      dispatcher: useProxy ? proxyDispatcher : undefined, redirect: 'follow',
    });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"edge_followed_by":\{"count":(\d+)/) || html.match(/content="([\d.,]+[KMB]?)\s+Followers/i);
    if (!m) return null;
    if (/^\d+$/.test(m[1])) return parseInt(m[1], 10);
    const am = m[1].match(/^([\d.,]+)\s*([KMB])?$/i);
    if (!am) return null;
    const n = parseFloat(am[1].replace(/,/g, ''));
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[(am[2] || '').toUpperCase()] || 1;
    return Number.isFinite(n) ? Math.round(n * mult) : null;
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

const handle = h => String(h || '').replace(/^@/, '').replace(/\/$/, '').trim();

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) { const k = n / 1e3; return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K'; }
  return Math.round(n).toString();
}

module.exports = {
  UA, fetchIG, fetchTikTok, fetchX, getGuestToken, runTasks, handle, formatNum,
  proxyActive: () => !!proxyDispatcher,
  proxyDispatcher: () => proxyDispatcher,
  proxyFetch: () => proxyFetch,
};
