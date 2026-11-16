// api/contract-parse.js — reads a contract PDF with Claude and returns the
// terms the Contracts tab stores (party, type, term, guaranteed money,
// incentives, payout schedule). Staff review the result before it is saved —
// nothing here writes to the sheet.
//
// POST { pdf: <base64>, name: <file name> } → { terms }
// Admin sessions only. The PDF comes straight from the browser (contracts are
// a few hundred KB; Vercel's body ceiling is ~4.5MB).
const Anthropic = require('@anthropic-ai/sdk');
const { authState } = require('../lib/auth');

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You read athlete contracts for a sports agency and pull out the money terms. The documents are NIL agreements, university revenue-share (NIL license) agreements, marketing representation agreements, and similar.

Rules:
- "guaranteed" is the total cash the athlete is owed if they simply stay in good standing for the term — sum every fixed payment, including any initial/signing payment. Do not include conditional money.
- "incentives" are conditional payments (performance, playtime, milestones, enhancements). One entry each with the condition as the label.
- "payouts" is the full schedule of fixed payments in order. Use ISO dates (YYYY-MM-DD). If a payment has no calendar date (e.g. "within 10 days of signing"), leave date empty and describe it in period.
- "type": "Rev-share" for a school/institution NIL license or revenue-share agreement; "NIL" for an agency, collective, or brand NIL/marketing agreement; "Other" otherwise.
- "party" is the organization paying the athlete (school, agency, collective, brand) — short name, no "LLC" unless needed to tell it apart.
- "year" is the calendar year the agreement mainly covers (the year most payments land).
- "notes" is one short sentence on anything unusual (exclusivity, buyout, conditions). Empty if nothing notable.
- Amounts are plain numbers in dollars, no symbols.
- If the document is not a contract, set type to "Other" and leave the money fields empty.`;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    athlete: { type: 'string' },
    party: { type: 'string' },
    type: { type: 'string', enum: ['Rev-share', 'NIL', 'Other'] },
    year: { type: 'integer' },
    start: { type: 'string' },
    end: { type: 'string' },
    guaranteed: { type: 'number' },
    incentives: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, amount: { type: 'number' } }, required: ['label', 'amount'] } },
    payouts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { date: { type: 'string' }, period: { type: 'string' }, amount: { type: 'number' } }, required: ['date', 'period', 'amount'] } },
    notes: { type: 'string' },
  },
  required: ['athlete', 'party', 'type', 'year', 'start', 'end', 'guaranteed', 'incentives', 'payouts', 'notes'],
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { configured, admin } = authState(req);
  if (configured && !admin) return res.status(401).json({ error: 'Not authorized' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is not configured on the server.' });
  const { pdf, name } = req.body || {};
  if (!pdf || typeof pdf !== 'string') return res.status(400).json({ error: 'Missing PDF' });
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODEL, max_tokens: 8000, system: SYSTEM,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.replace(/\s+/g, '') } },
        { type: 'text', text: `Extract the contract terms from this document${name ? ` (file: ${String(name).slice(0, 120)})` : ''}.` },
      ] }],
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'The AI declined to read this file. Enter the terms by hand.' });
    const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let terms;
    try { terms = JSON.parse(text); } catch { return res.status(502).json({ error: 'Could not read the terms. Enter them by hand.' }); }
    return res.json({ terms });
  } catch (e) {
    const status = e && e.status;
    return res.status(502).json({ error: status === 413 ? 'File too large to read automatically.' : `Read failed: ${e.message}` });
  }
};
