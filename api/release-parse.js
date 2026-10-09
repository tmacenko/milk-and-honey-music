// api/release-parse.js — turns the raw Friday release email into the exact
// text the Release Story tool expects (tools/release-stories), so nobody has
// to reformat it by hand first:
//
//   Artist, Artist - Title
//   Co written by Client            (optional — one block per client credit)
//   Milk & Honey Records            (optional)
//   https://open.spotify.com/track/… (tracking params stripped)
//
// Artist and title always come from Spotify (by link, or by search when the
// email has no link); the AI only does the fuzzy part — which lines belong to
// which release, who's credited for what, which "artist" is really a client
// credit. Owner-only, like the tool itself.
const Anthropic = require('@anthropic-ai/sdk');
const { authState } = require('../lib/auth');

const OWNERS = String(process.env.USAGE_OWNERS || 'tyler@milkhoneyla.com').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const MODEL = 'claude-sonnet-5';

let spToken = null, spExp = 0;
async function spotifyToken() {
  if (spToken && Date.now() < spExp) return spToken;
  const cid = process.env.SPOTIFY_CLIENT_ID, csec = process.env.SPOTIFY_CLIENT_SECRET;
  if (!cid || !csec) return null;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${cid}:${csec}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  spToken = d.access_token || null; spExp = Date.now() + 50 * 60 * 1000;
  return spToken;
}
const spGet = async (path) => {
  const tok = await spotifyToken();
  if (!tok) return null;
  const r = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  return r.ok ? r.json() : null;
};
// "Title - Sullivan King Remix" → "Title (Sullivan King Remix)" (the tool shows
// titles as-is; the email convention is the parenthesised form).
const tidyTitle = (t) => String(t || '').replace(/\s+-\s+([^-]*\b(remix|edit|mix|version|dub|bootleg|flip|rework)\b[^-]*)$/i, ' ($1)').trim();
const cleanLink = (u) => String(u || '').replace(/[?#].*$/, '');
async function lookup(kind, id) {
  const d = await spGet(`/${kind}s/${id}`);
  if (!d) return null;
  return { artist: (d.artists || []).map(a => a.name).join(', '), title: tidyTitle(d.name), link: `https://open.spotify.com/${kind}/${id}` };
}
async function search(artist, title) {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  const d = await spGet(`/search?q=${q}&type=track&limit=5`);
  const items = (d && d.tracks && d.tracks.items) || [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(artist).slice(0, 6);
  const hit = items.find(t => (t.artists || []).some(a => norm(a.name).includes(want) || want.includes(norm(a.name).slice(0, 6)))) || null;
  return hit ? { artist: hit.artists.map(a => a.name).join(', '), title: tidyTitle(hit.name), link: `https://open.spotify.com/track/${hit.id}` } : null;
}

const SCHEMA = {
  type: 'object',
  properties: {
    releases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          link: { type: 'integer', description: 'Index into the LINKS list, or -1 when the email gives no Spotify link for this release.' },
          artist: { type: 'string', description: 'Artist name(s) as written in the email (only used when link is -1).' },
          title: { type: 'string', description: 'Release title as written in the email (only used when link is -1).' },
          credit: { type: 'string', description: 'One credit line for ONE client, e.g. "Co written by Joe Kirkland". Empty when the client is the artist.' },
          records: { type: 'boolean', description: 'Released on Milk & Honey Records.' },
        },
        required: ['link', 'artist', 'title', 'credit', 'records'],
        additionalProperties: false,
      },
    },
  },
  required: ['releases'],
  additionalProperties: false,
};

const SYSTEM = `You split a messy Friday "new releases" email from the talent agency Milk & Honey into one entry per client per release.

You get: the raw email, a numbered LINKS list (each Spotify link in the email with its real artist and title from Spotify), and the agency's CLIENTS list (name and roles).

Rules:
- Each Spotify link is one release. The lines above a link (until the previous link or a blank gap) describe it: an artist/title line, zero or more credit lines, maybe "Milk & Honey Records". A release with credit lines and NO artist/title line is normal — the LINKS metadata supplies them.
- A release that has NO Spotify link (artist/title and credits only) is still a release: set link to -1 and give the artist and title from the email.
- Credits: a credit line names the client's role ("Co written by X", "Produced by X", "Mix and additional programming by X", "Co-produced and co-written by X"). Make ONE entry per credited client. If one line credits several people ("Produced by A and co written by B and A"), split it: "Produced and co written by A", "Co written by B". Keep the role wording from the email (fix obvious typos, capitalise the first letter), and name exactly one person per credit line.
- If the credited person IS the release's artist (e.g. "Oyster by Tori Tullier — written by Tori Tullier"), that is an artist release: ONE entry, credit "".
- A release with no credit lines is an artist release: one entry, credit "".
- Use CLIENTS to recognise people; a credited name that's a client alias (e.g. "Alexis Idarose Kesselman" for "Alexis Kesselman (Idarose)") keeps the email's wording.
- "Milk & Honey Records" / "M&H Records" anywhere in a release's lines → records true.
- Never invent credits. Never drop a release. Keep the email's order.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const st = authState(req);
  if (!st.user || !OWNERS.includes(String(st.user.email || '').toLowerCase())) return res.status(403).json({ error: 'Not authorized' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is not configured on the server.' });
  const text = String((req.body || {}).text || '').trim().slice(0, 20000);
  if (!text) return res.status(400).json({ error: 'Nothing to clean up' });
  const clients = (Array.isArray((req.body || {}).clients) ? req.body.clients : []).slice(0, 500)
    .map(c => ({ name: String(c.name || '').trim(), roles: Array.isArray(c.types) ? c.types.join(', ') : '' })).filter(c => c.name);

  try {
    // Every Spotify link, in order, with its real artist/title.
    const seen = new Map();
    for (const m of text.matchAll(/https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album)\/([A-Za-z0-9]+)/g)) {
      const key = `${m[1]}/${m[2]}`;
      if (!seen.has(key)) seen.set(key, { kind: m[1], id: m[2], raw: m[0] });
    }
    const links = [...seen.values()];
    const meta = await Promise.all(links.map(l => lookup(l.kind, l.id).catch(() => null)));
    const linksText = links.map((l, i) => `${i}: ${l.raw} → ${meta[i] ? `${meta[i].artist} - ${meta[i].title}` : '(not found on Spotify)'}`).join('\n') || '(none)';

    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 4096, thinking: { type: 'disabled' }, system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'text', text: `CLIENTS:\n${clients.map(c => `${c.name}${c.roles ? ` (${c.roles})` : ''}`).join('\n') || '(none)'}` },
        { type: 'text', text: `LINKS:\n${linksText}` },
        { type: 'text', text: `EMAIL:\n${text}` },
      ] }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });
    const out = JSON.parse((resp.content || []).find(b => b.type === 'text')?.text || '{"releases":[]}');

    const blocks = [], notes = [];
    for (const r of out.releases || []) {
      let m = r.link >= 0 && r.link < links.length ? meta[r.link] : null;
      if (!m && r.link >= 0 && links[r.link]) m = { artist: r.artist, title: r.title, link: cleanLink(links[r.link].raw) }; // Spotify lookup failed — keep the email's words
      if (!m) {
        m = await search(r.artist, r.title).catch(() => null);
        if (!m) { m = { artist: r.artist, title: r.title, link: '' }; notes.push(`${r.artist} - ${r.title}: no Spotify link found — add one`); }
      }
      const lines = [`${m.artist} - ${m.title}`];
      if (r.credit) lines.push(r.credit.trim().replace(/^./, c => c.toUpperCase()));
      if (r.records) lines.push('Milk & Honey Records');
      lines.push(m.link || '(add the Spotify link here)');
      blocks.push(lines.join('\n'));
    }
    return res.json({ text: blocks.join('\n\n'), count: blocks.length, notes });
  } catch (err) {
    console.error('release-parse error:', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'Clean-up failed' });
  }
};
