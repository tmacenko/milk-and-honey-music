// api/box.js — per-person document folders backed by the company's Box.
//
// The app authenticates server-to-server as its Box service account (Client
// Credentials Grant) and keeps a simple folder tree in that account's storage:
//   Athletes/<player name>/…   Clients/<client name>/…
// Folders are found by name and created on demand — no sheet schema changes.
// Team members see the same tree in normal Box once the service account's
// folders are shared with them (one-time collaboration invite).
//
// GET  ?person=Name&kind=sports|music
//        → { folderId, items:[{id,name,size,modifiedAt}], token }
//          `token` is downscoped to THAT folder only (upload/download/preview)
//          so the browser can push files straight to upload.box.com — big
//          files never pass through this function (Vercel caps bodies ~4.5MB).
// GET  ?download=fileId → { url } — a short-lived direct download link.
// POST { action:'delete', fileId } → moves the file to the Box trash.
//
// All calls require an admin session (company logins only).
const { authState } = require('../lib/auth');

const API = 'https://api.box.com/2.0';
// The folder tree lives in the COMPANY Box: Tyler created "Milk & Honey
// Portal/Sports|Music" and invited the app's service account as an Editor, so
// everything the app stores is natively visible to the team. The app walks
// (and if ever missing, creates) this path from its own root — collaborated
// folders appear there automatically.
const ROOTS = { sports: ['Milk & Honey Portal', 'Sports'], music: ['Milk & Honey Portal', 'Music'] };

// Service-account token + root folder ids, cached per warm instance.
let cachedToken = null, cachedTokenExp = 0;
const rootIds = {};

function envOk() {
  return process.env.BOX_CLIENT_ID && process.env.BOX_CLIENT_SECRET && process.env.BOX_ENTERPRISE_ID;
}

async function serviceToken() {
  if (cachedToken && Date.now() < cachedTokenExp) return cachedToken;
  const r = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.BOX_CLIENT_ID,
      client_secret: process.env.BOX_CLIENT_SECRET,
      box_subject_type: 'enterprise',
      box_subject_id: process.env.BOX_ENTERPRISE_ID,
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Box auth failed: ' + (d.error_description || d.error || r.status));
  cachedToken = d.access_token;
  cachedTokenExp = Date.now() + Math.max(60, (d.expires_in || 3600) - 300) * 1000;
  return cachedToken;
}

async function boxApi(token, path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Box ${path}: ${d.message || d.code || r.status}`);
  return d;
}

async function findOrCreateFolder(token, parentId, name) {
  const list = await boxApi(token, `/folders/${parentId}/items?limit=1000&fields=id,name,type`);
  const hit = (list.entries || []).find(e => e.type === 'folder' && e.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit.id;
  try {
    const made = await boxApi(token, '/folders', {
      method: 'POST', body: JSON.stringify({ name, parent: { id: String(parentId) } }),
    });
    return made.id;
  } catch (e) {
    // Lost a create race — the folder exists now; find it.
    if (/item_name_in_use|409/.test(e.message)) {
      const again = await boxApi(token, `/folders/${parentId}/items?limit=1000&fields=id,name,type`);
      const h2 = (again.entries || []).find(x => x.type === 'folder' && x.name.toLowerCase() === name.toLowerCase());
      if (h2) return h2.id;
    }
    throw e;
  }
}

async function rootFor(token, kind) {
  const path = ROOTS[kind];
  if (!path) throw new Error('Bad kind');
  if (rootIds[kind]) return rootIds[kind];
  let id = '0';
  for (const name of path) id = await findOrCreateFolder(token, id, name);
  rootIds[kind] = id;
  return id;
}

// Exchange the service token for one that can only touch this one folder —
// safe to hand to the browser for direct uploads/downloads.
async function downscope(token, folderId) {
  const r = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: token,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      scope: 'item_upload item_download item_preview',
      resource: `${API}/folders/${folderId}`,
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Box downscope failed: ' + (d.error_description || d.error || r.status));
  return d.access_token;
}

// Folder names must avoid Box-invalid characters; keep them human-readable.
const safeName = (s) => String(s || '').trim().replace(/[/\\]/g, '-').slice(0, 100);

module.exports = async (req, res) => {
  const { configured, admin } = authState(req);
  if (configured && !admin) return res.status(401).json({ error: 'Not authorized' });
  if (!envOk()) return res.status(501).json({ error: 'Box is not connected yet (missing BOX_* env vars).' });

  try {
    const token = await serviceToken();

    if (req.method === 'GET' && req.query.download) {
      const r = await fetch(`${API}/files/${encodeURIComponent(req.query.download)}/content`, {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'manual',
      });
      const url = r.headers.get('location');
      if (!url) return res.status(500).json({ error: 'No download link from Box' });
      return res.json({ url });
    }

    if (req.method === 'GET') {
      const person = safeName(req.query.person);
      const kind = String(req.query.kind || 'sports');
      if (!person) return res.status(400).json({ error: 'Missing person' });
      const rootId = await rootFor(token, kind);
      const folderId = await findOrCreateFolder(token, rootId, person);
      const [list, scoped] = await Promise.all([
        boxApi(token, `/folders/${folderId}/items?limit=1000&fields=id,name,type,size,modified_at`),
        downscope(token, folderId),
      ]);
      const items = (list.entries || [])
        .filter(e => e.type === 'file')
        .map(e => ({ id: e.id, name: e.name, size: e.size || 0, modifiedAt: e.modified_at || '' }))
        .sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));
      return res.json({ folderId, items, token: scoped });
    }

    if (req.method === 'POST') {
      const { action, fileId } = req.body || {};
      if (action === 'delete' && fileId) {
        await boxApi(token, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Box error:', err);
    return res.status(500).json({ error: err.message });
  }
};
