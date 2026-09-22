// In-memory cache for Google Sheets reads (per warm serverless instance).
//
// Why: every dashboard load fans out into several sheet reads, and Google
// rations reads per minute across ALL users (the 2026-09-11 quota incident
// took the site down for a minute with a fraction of today's headcount).
// With this cache, N concurrent staff cost roughly the same as one.
//
// Freshness contract: reads are served from memory for up to 60s; every POST
// (mutation) clears this instance's cache, and the client sends ?fresh=1 on
// its read-after-write reloads so the writer always sees their change even if
// it lands on a different instance. If Google errors (429 bursts), the last
// good copy is served for up to 10 minutes instead of failing the page.
const FRESH_MS = 60 * 1000;
const STALE_OK_MS = 10 * 60 * 1000;
const store = new Map();

function makeCachedGet(rawGet, ns) {
  return async function cachedGet(token, range) {
    const key = ns + '|' + range;
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now - hit.ts < FRESH_MS) return hit.data;
    try {
      const data = await rawGet(token, range);
      store.set(key, { ts: now, data });
      return data;
    } catch (e) {
      if (hit && now - hit.ts < STALE_OK_MS) return hit.data; // ride out quota bursts
      throw e;
    }
  };
}

function clearSheetCache() { store.clear(); }

module.exports = { makeCachedGet, clearSheetCache };
