// api/refresh-music-socials.js — daily follower refresh for MUSIC clients.
//
// Same engine as the sports sync (shared lib/social-scrapers.js), pointed at
// the music sheet: reads each client's Instagram / Twitter/X / TikTok handles
// from the Clients tab and writes current follower counts into robot-owned
// columns on that same tab (igFollowers / twitterFollowers / tiktokFollowers —
// auto-created on first run). Never blanks a value on a failed fetch.
//
// Also keeps a hidden SocialHistory tab (date|name|ig|x|tk) in the music sheet
// and computes 7-day growth (growth7d / growth7dPct / growthDays) with the
// same rules as sports: baseline = snapshot closest to 7 days old, and only
// platforms present in BOTH snapshots count — a newly added handle is data
// onboarding, not growth.
//
// Cadence mirrors sports: X + TikTok daily; Instagram Mondays and Thursdays
// (IG runs through the paid residential proxy — twice a week keeps bandwidth
// low and a 7-day growth window barely notices). ?platforms=ig,x,tiktok
// overrides for manual runs; ?name= targets one client (the just-added flow).
//
// Auth: admin cookie, or `Authorization: Bearer $CRON_SECRET`, or ?key=.
const crypto = require('crypto');
const { authState } = require('../lib/auth');
const { fetchIG, chooseIG, fetchTikTok, fetchX, getGuestToken, runTasks, handle, formatNum, parseCount: parseStored, proxyActive } = require('../lib/social-scrapers');

const SHEET_ID = process.env.MUSIC_SHEET_ID;

// ── Google Sheets helpers ─────────────────────────────────────────────────────
function b64url(s) { return Buffer.from(s).toString('base64url'); }
async function getToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
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

// Ensure the Clients tab has the given robot columns, growing the grid when
// the sheet is at its width limit. Returns the refreshed header row.
async function ensureClientCols(token, headers, needCols) {
  const missing = needCols.filter(c => !headers.some(h => h.toLowerCase() === c.toLowerCase()));
  if (!missing.length) return headers;
  const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties(columnCount)))`, { headers: { Authorization: `Bearer ${token}` } });
  const meta = await metaR.json();
  const cMeta = (meta.sheets || []).find(s => (s.properties?.title || '').trim() === 'Clients');
  if (!cMeta) throw new Error('Clients tab not found');
  const width = cMeta.properties?.gridProperties?.columnCount || headers.length;
  if (headers.length + missing.length > width) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ appendDimension: { sheetId: cMeta.properties.sheetId, dimension: 'COLUMNS', length: headers.length + missing.length - width } }] }),
    });
  }
  await sheetBatchUpdate(token, [{ range: `Clients!${colLetter(headers.length)}1`, values: [missing] }]);
  return [...headers, ...missing];
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
  if (!SHEET_ID) return res.status(500).json({ error: 'MUSIC_SHEET_ID not set' });
  if (!authorized(req)) return res.status(403).json({ error: 'Not authorized' });

  const q = req.query || {};
  const dryRun = q.dryRun === '1' || q.dryRun === 'true';
  const igDay = [1, 4].includes(new Date().getUTCDay());
  const only = q.platforms ? String(q.platforms).split(',').map(s => s.trim()) : ['tiktok', 'x', ...(igDay ? ['ig'] : [])];
  const deadline = Date.now() + 52000;

  try {
    const token = await getToken();
    const sheet = await sheetGet(token, 'Clients!A1:ZZ');
    const rows = sheet.values || [];
    let headers = (rows[0] || []).map(h => String(h || '').trim());
    const col = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const nameC = col('Name'), igHC = col('Instagram'), twHC = col('Twitter/X'), tkHC = col('TikTok');
    if (nameC < 0) return res.status(500).json({ error: 'Clients has no Name column' });

    headers = await ensureClientCols(token, headers, ['igFollowers', 'twitterFollowers', 'tiktokFollowers']);
    const igCol = col('igFollowers'), twCol = col('twitterFollowers'), tkCol = col('tiktokFollowers');

    // nameLower -> { name, row (1-based), ig, tw, tk, cells }
    const clients = {};
    rows.forEach((r, i) => {
      if (i === 0) return;
      const name = String(r[nameC] || '').trim();
      if (!name) return;
      clients[name.toLowerCase()] = {
        name, row: i + 1, cells: r,
        ig: handle(igHC >= 0 ? r[igHC] : ''), tw: handle(twHC >= 0 ? r[twHC] : ''), tk: handle(tkHC >= 0 ? r[tkHC] : ''),
      };
    });
    const allNames = Object.keys(clients).sort();
    const onlyName = String(q.name || '').trim().toLowerCase();
    const names = onlyName ? allNames.filter(n => n === onlyName) : allNames;

    const guestToken = only.includes('x') ? await getGuestToken() : null;
    const results = {};
    const stats = { ig: { ok: 0, fail: 0 }, tiktok: { ok: 0, fail: 0 }, x: { ok: 0, fail: 0 } };
    const tasks = [];
    for (const n of names) {
      const c = clients[n];
      results[n] = {};
      if (only.includes('ig') && c.ig) tasks.push(async () => {
        const v = await fetchIG(c.ig);
        // A coarse meta read never clobbers a finer stored count (chooseIG).
        const existing = igCol >= 0 ? parseStored(c.cells[igCol]) : null;
        const chosen = chooseIG(v, existing);
        if (chosen != null) { results[n].ig = chosen; stats.ig.ok++; } else stats.ig.fail++;
      });
      if (only.includes('tiktok') && c.tk) tasks.push(async () => { const v = await fetchTikTok(c.tk); if (v != null) { results[n].tk = v; stats.tiktok.ok++; } else stats.tiktok.fail++; });
      if (only.includes('x') && c.tw) tasks.push(async () => { const v = await fetchX(c.tw, guestToken); if (v != null) { results[n].tw = v; stats.x.ok++; } else stats.x.fail++; });
    }
    const run = await runTasks(tasks, 6, deadline);

    const updates = [];
    for (const n of names) {
      const r = results[n], c = clients[n];
      if (!r || !c) continue;
      if (r.ig != null && igCol >= 0) updates.push({ range: `Clients!${colLetter(igCol)}${c.row}`, values: [[formatNum(r.ig)]] });
      if (r.tw != null && twCol >= 0) updates.push({ range: `Clients!${colLetter(twCol)}${c.row}`, values: [[formatNum(r.tw)]] });
      if (r.tk != null && tkCol >= 0) updates.push({ range: `Clients!${colLetter(tkCol)}${c.row}`, values: [[formatNum(r.tk)]] });
    }
    if (!dryRun) await sheetBatchUpdate(token, updates);

    // ── Social history + 7-day growth (mirrors the sports pass) ──────────────
    const history = { snapshots: 0, growthWritten: 0, pruned: 0, error: null };
    try { if (!onlyName) {
      const parseCount = (s) => {
        const t = String(s ?? '').trim().replace(/,/g, '');
        if (!t) return null;
        const m = t.match(/^([\d.]+)\s*([KMB])?$/i);
        if (!m) return null;
        const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
        const n = parseFloat(m[1]) * mult;
        return Number.isFinite(n) ? Math.round(n) : null;
      };
      const HIST_HEAD = ['date', 'name', 'igFollowers', 'twitterFollowers', 'tiktokFollowers'];
      let hist = null;
      try { hist = await sheetGet(token, "'SocialHistory'!A:E"); }
      catch {
        if (!dryRun) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'SocialHistory', hidden: true, gridProperties: { rowCount: 20000, columnCount: 5 } } } }] }),
          });
          await sheetAppendRows(token, "'SocialHistory'!A:E", [HIST_HEAD]);
          hist = { values: [HIST_HEAD] };
        }
      }
      // Today's number per client: fresh fetch if we got one, else the stored
      // value — so IG clients still snapshot on non-IG days.
      const today = new Date().toISOString().slice(0, 10);
      const current = {};
      for (const n of allNames) {
        const c = clients[n], r = results[n] || {};
        current[n] = {
          ig: r.ig != null ? r.ig : parseCount(igCol >= 0 ? c.cells[igCol] : null),
          tw: r.tw != null ? r.tw : parseCount(twCol >= 0 ? c.cells[twCol] : null),
          tk: r.tk != null ? r.tk : parseCount(tkCol >= 0 ? c.cells[tkCol] : null),
        };
      }
      const histRows = (hist?.values || []).slice(1);
      const alreadyToday = histRows.some(r => r[0] === today);
      if (hist && !alreadyToday) {
        const snapRows = allNames
          .filter(n => { const c = current[n]; return c.ig != null || c.tw != null || c.tk != null; })
          .map(n => [today, clients[n].name, current[n].ig ?? '', current[n].tw ?? '', current[n].tk ?? '']);
        if (!dryRun && snapRows.length) await sheetAppendRows(token, "'SocialHistory'!A:E", snapRows);
        history.snapshots = snapRows.length;
      } else if (hist && alreadyToday && q.resnap === '1') {
        // Maintenance: rewrite today's snapshot rows with the current values —
        // used after a data-quality fix so tomorrow's growth doesn't diff
        // against bad numbers.
        const snapUpdates = [];
        (hist.values || []).forEach((r, i) => {
          if (i === 0 || r[0] !== today) return;
          const c = current[String(r[1] || '').toLowerCase().trim()];
          if (!c) return;
          snapUpdates.push({ range: `'SocialHistory'!C${i + 1}:E${i + 1}`, values: [[c.ig ?? '', c.tw ?? '', c.tk ?? '']] });
        });
        if (!dryRun) await sheetBatchUpdate(token, snapUpdates);
        history.resnapped = snapUpdates.length;
      }
      // Baseline: per client, the snapshot closest to 7 days old (0.9–10d window).
      const baseline = {};
      for (const r of histRows) {
        const d = new Date(r[0]);
        if (isNaN(d)) continue;
        const age = (Date.now() - d.getTime()) / 86400000;
        if (age < 0.9 || age > 10) continue;
        const ig = parseCount(r[2]) || 0, tw = parseCount(r[3]) || 0, tk = parseCount(r[4]) || 0;
        if (!(ig + tw + tk)) continue;
        const k = String(r[1] || '').toLowerCase().trim();
        if (!baseline[k] || Math.abs(age - 7) < Math.abs(baseline[k].age - 7)) baseline[k] = { age, ig, tw, tk };
      }
      if (Object.keys(baseline).length) {
        headers = await ensureClientCols(token, headers, ['growth7d', 'growth7dPct', 'growthDays']);
        const g7Col = col('growth7d'), gPctCol = col('growth7dPct'), gDaysCol = col('growthDays');
        const gUpdates = [];
        for (const n of allNames) {
          const past = baseline[n];
          if (!past || g7Col < 0 || gPctCol < 0) continue;
          const c = current[n];
          let base = 0, now = 0;
          if (past.ig > 0) { base += past.ig; now += c.ig || 0; }
          if (past.tw > 0) { base += past.tw; now += c.tw || 0; }
          if (past.tk > 0) { base += past.tk; now += c.tk || 0; }
          if (!base || !now) continue;
          const delta = now - base;
          const rowNum = clients[n].row;
          gUpdates.push({ range: `Clients!${colLetter(g7Col)}${rowNum}`, values: [[String(delta)]] });
          gUpdates.push({ range: `Clients!${colLetter(gPctCol)}${rowNum}`, values: [[((delta / base) * 100).toFixed(1)]] });
          if (gDaysCol >= 0) gUpdates.push({ range: `Clients!${colLetter(gDaysCol)}${rowNum}`, values: [[String(Math.round(past.age))]] });
        }
        if (!dryRun) await sheetBatchUpdate(token, gUpdates);
        history.growthWritten = gUpdates.length;
      }
      // Prune snapshots older than 30 days once a meaningful backlog builds.
      const oldCount = histRows.filter(r => { const d = new Date(r[0]); return !isNaN(d) && (Date.now() - d.getTime()) / 86400000 > 30; }).length;
      if (oldCount > 400 && !dryRun) {
        const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`, { headers: { Authorization: `Bearer ${token}` } });
        const meta = await metaR.json();
        const shMeta = (meta.sheets || []).find(s => (s.properties?.title || '').trim() === 'SocialHistory');
        if (shMeta) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: shMeta.properties.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + oldCount } } }] }),
          });
          history.pruned = oldCount;
        }
      }
    } } catch (e) { history.error = e.message; }

    const sample = names.slice(0, 3).map(n => ({ name: clients[n].name, ig: results[n].ig, x: results[n].tw, tiktok: results[n].tk }));
    return res.json({
      success: true, dryRun, proxyActive: proxyActive(), clientsProcessed: names.length, tasksRun: run.done,
      timedOut: run.timedOut, cellsWritten: dryRun ? 0 : updates.length,
      platforms: stats, guestTokenObtained: !!guestToken, sample, history,
    });
  } catch (err) {
    console.error('refresh-music-socials error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
