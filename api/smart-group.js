// api/smart-group.js — natural-language roster filter.
// Takes a plain-English query ("all defensive players in the Midwest",
// "producers signed to BMI", "Jake Presser's clients") plus a compact roster,
// and returns the matching names + a descriptive title, via Claude Sonnet 5.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';
const MAX_ROSTER = 400;   // safety cap on how many rows we'll reason over
const MAX_QUERY = 400;    // safety cap on query length

// Structured output: guarantees valid, parseable JSON.
const SCHEMA = {
  type: 'object',
  properties: {
    names: { type: 'array', items: { type: 'string' }, description: 'Exact names from the roster that match the query.' },
    title: { type: 'string', description: 'A short descriptive title for this group, prefixed "Milk & Honey ".' },
  },
  required: ['names', 'title'],
  additionalProperties: false,
};

const SYSTEM = `You are a roster filter for the talent agency Milk & Honey. You are given a JSON roster and a plain-English request describing a subset of that roster.

Return ONLY the people who genuinely match the request:
- Reason about attributes that aren't literal fields. "Defensive players" = defensive football positions (DE, DT, LB, CB, S, etc.). "Midwest" = states/teams in that US region. "Signed to BMI" = pro is BMI. Someone's "clients" = people whose contact/rep is that person.
- Match on meaning, not just substring. If the request names a rep, region, genre, position group, label, PRO, etc., include everyone who fits.
- Use the EXACT "name" strings from the roster in your output. Do not invent, rename, or partially match names.
- If nothing matches, return an empty list.

Also produce a concise, human-readable "title" describing what the group shows — NOT the user's raw prompt. Always prefix it with "Milk & Honey ". Examples: "Milk & Honey Midwest Defensive Roster", "Milk & Honey BMI Songwriters", "Milk & Honey — Jake Presser's Clients".`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI search is not configured yet. Add ANTHROPIC_API_KEY in Vercel to enable it.' });
  }

  try {
    const body = req.body || {};
    const query = String(body.query || '').trim().slice(0, MAX_QUERY);
    const roster = Array.isArray(body.roster) ? body.roster.slice(0, MAX_ROSTER) : [];
    if (!query) return res.status(400).json({ error: 'No query provided' });
    if (!roster.length) return res.status(400).json({ error: 'No roster provided' });

    const validNames = new Set(roster.map(r => String(r.name || '')).filter(Boolean));

    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'disabled' },   // light classification — keep it fast + cheap
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Roster (JSON):\n${JSON.stringify(roster)}`, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `Request: ${query}` },
        ],
      }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });

    const text = (resp.content || []).find(b => b.type === 'text')?.text || '{}';
    let data;
    try { data = JSON.parse(text); } catch { data = { names: [], title: '' }; }

    // Only trust names that actually exist in the roster we sent.
    const names = (Array.isArray(data.names) ? data.names : []).filter(n => validNames.has(n));
    const title = String(data.title || '').trim() || 'Milk & Honey — Custom Group';

    return res.json({ names, title, count: names.length });
  } catch (err) {
    console.error('smart-group error:', err.message);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'AI search failed' });
  }
};
