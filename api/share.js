// api/share.js — handles both group roster and individual one-pager shares
const crypto = require('crypto');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://milk-and-honey-music.vercel.app').replace(/\/$/, '');
const BLOB_API = 'https://blob.vercel-storage.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not set' });

  // ── POST: save share ────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = req.body;
      if (!body) return res.status(400).json({ error: 'No data provided' });

      const id = crypto.randomBytes(8).toString('hex');
      const filename = `share-${id}.json`;

      let payload;
      if (body.type === 'individual') {
        if (!body.athlete?.name) return res.status(400).json({ error: 'No athlete provided' });
        payload = JSON.stringify({
          id,
          type: 'individual',
          createdAt: new Date().toISOString(),
          athlete:       body.athlete,
          brandName:     body.brandName     || '',
          keywords:      body.keywords      || [],
          pitch:         body.pitch         || '',
          ideas:         body.ideas         || [],
          aboutText:     body.aboutText     || '',
          secondaryPhoto: body.secondaryPhoto || null,
          brandLogo:     body.brandLogo     || null,
          theme:         body.theme         || 'dark',
          // Pitch mode + generic outreach
          pitchMode:     body.pitchMode     || 'specific',
          outreachTitle: body.outreachTitle || '',
          outreachCards: body.outreachCards || [],
          // Photo positioning
          photoX:        body.photoX        ?? 50,
          photoY:        body.photoY        ?? 50,
          photoZoom:     body.photoZoom     ?? 100,
          fontScale:     body.fontScale     ?? 1.0,
          // Section toggles
          toggles: {
            showSocials:   body.toggles?.showSocials   ?? true,
            showMusic:     body.toggles?.showMusic     ?? true,
            showInterests: body.toggles?.showInterests ?? true,
            showBrands:    body.toggles?.showBrands    ?? true,
            showPitch:     body.toggles?.showPitch     ?? true,
          },
        });
      } else if (body.type === 'roster-share') {
        // Interactive shareable roster
        const { athletes, title, expiresAt } = body;
        if (!athletes?.length) return res.status(400).json({ error: 'No athletes provided' });
        payload = JSON.stringify({
          id, type: 'roster-share',
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt || null,
          title: title || 'Milk & Honey Sports — Athlete Roster',
          athletes,
        });
      } else {
        // Group roster
        const { athletes, title, showSocials, showReach, showStats, showClassOf, cardSize, theme } = body;
        if (!athletes?.length) return res.status(400).json({ error: 'No athletes provided' });
        payload = JSON.stringify({
          id, type: 'group', createdAt: new Date().toISOString(),
          title: title || 'Milk & Honey Sports — Athlete Roster',
          athletes, settings: { showSocials, showReach, showStats, showClassOf, cardSize, theme },
        });
      }

      const uploadResp = await fetch(`${BLOB_API}/${filename}`, {
        method: 'PUT',
        headers: { 'authorization': `Bearer ${TOKEN}`, 'x-api-version': '7', 'content-type': 'application/json' },
        body: payload,
      });

      const uploadText = await uploadResp.text();
      if (!uploadResp.ok) throw new Error(`Blob upload failed (${uploadResp.status}): ${uploadText}`);

      const url = body.type === 'roster-share'
        ? `${APP_URL}/roster/${id}`
        : `${APP_URL}/share/${id}`;
      return res.json({ id, url });
    } catch (err) {
      console.error('Share create error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET: retrieve share ─────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const listParams = new URLSearchParams({ prefix: `share-${id}`, limit: '1' });
      const listResp = await fetch(`${BLOB_API}?${listParams}`, {
        headers: { 'authorization': `Bearer ${TOKEN}`, 'x-api-version': '7' },
      });
      if (!listResp.ok) return res.status(404).json({ error: 'Share not found' });

      const listData = await listResp.json();
      const blob = listData.blobs?.[0];
      if (!blob) return res.status(404).json({ error: 'Share not found or expired' });

      const dataResp = await fetch(blob.url);
      if (!dataResp.ok) return res.status(404).json({ error: 'Share content unavailable' });

      let data;
      try { data = await dataResp.json(); }
      catch(e) { return res.status(500).json({ error: 'Failed to parse share data' }); }

      return res.json(data);
    } catch (err) {
      console.error('Share fetch error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
