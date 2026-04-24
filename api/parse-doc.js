// Vercel serverless function: classify + extract a parish facility document.
//
// POST /api/parse-doc
//   { pdfUrl, buildings:[{id,name,utility_account_numbers?}], openWOs:[{id,vendor,issue,date}] }
// Response:
//   { type, confidence, fields, matched_wo_id, building_id, notes }
//
// Uses Anthropic's tool-use feature for guaranteed-shape JSON output.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const tool = {
  name: 'classify_parish_document',
  description: 'Classify the attached PDF and extract structured fields for a parish facility manager.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['invoice', 'utility_bill', 'quote', 'coi', 'unknown'],
        description: 'invoice = vendor bill for work or supplies; utility_bill = electric/water/gas/etc.; quote = price estimate for proposed work; coi = Certificate of Insurance from a contractor; unknown = anything else.',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
      },
      fields: {
        type: 'object',
        description: 'Fields relevant to the detected type. Use null for missing values.',
        properties: {
          // Invoice / Quote
          vendor: { type: ['string', 'null'] },
          amount: { type: ['number', 'null'], description: 'Total dollar amount due' },
          date: { type: ['string', 'null'], description: 'Issue date in YYYY-MM-DD' },
          description: { type: ['string', 'null'], description: 'Brief scope of work / line item summary' },
          invoice_number: { type: ['string', 'null'] },
          quote_number: { type: ['string', 'null'] },
          valid_until: { type: ['string', 'null'], description: 'Quote expiration in YYYY-MM-DD' },
          // Utility
          provider: { type: ['string', 'null'] },
          account_number: { type: ['string', 'null'] },
          period_start: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
          period_end: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
          usage: { type: ['number', 'null'] },
          usage_unit: { type: ['string', 'null'], description: 'kWh, gal, therm, CCF, etc.' },
          cost: { type: ['number', 'null'], description: 'Total amount due' },
          utility_type: {
            type: ['string', 'null'],
            enum: ['Electric', 'Water', 'Gas', 'Sewer', 'Propane', 'Trash', 'Internet', null],
          },
          // COI
          contractor: { type: ['string', 'null'] },
          policy_number: { type: ['string', 'null'] },
          expiration_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
          // Building hint (free-text — frontend will fuzzy-match against actual building list)
          building_hint: {
            type: ['string', 'null'],
            description: 'Building name as it appears on the document (often in service address or "bill to" block).',
          },
        },
      },
      matched_wo_id: {
        type: ['string', 'null'],
        description: 'If the document is an invoice that clearly matches one of the open work orders provided in context, return that work order id. Otherwise null.',
      },
      notes: {
        type: ['string', 'null'],
        description: 'Anything notable a human should know — unusual line items, late fees, discrepancies, etc.',
      },
    },
    required: ['type', 'confidence', 'fields'],
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  let body = req.body;
  // Vercel parses JSON automatically when content-type is application/json,
  // but fall back to manual parse in case it arrives as a string.
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { pdfUrl, buildings = [], openWOs = [] } = body || {};
  if (!pdfUrl) {
    res.status(400).json({ error: 'pdfUrl required' });
    return;
  }

  const buildingsList = buildings.length
    ? buildings.map(b => `- ${b.name}${b.utility_account_numbers ? ' (utility accounts: ' + b.utility_account_numbers.join(', ') + ')' : ''}`).join('\n')
    : '(none provided)';
  const wosList = openWOs.length
    ? openWOs.map(w => `- ${w.id}: ${w.vendor || '(no vendor)'} — ${w.issue} (${w.date || 'no date'})`).join('\n')
    : '(none provided)';

  const prompt = `The attached PDF was uploaded by a parish facility manager. Classify it and extract structured fields by calling the classify_parish_document tool.

Parish buildings (use the exact name in building_hint if you can match):
${buildingsList}

Open work orders at this parish (consider these for invoice matching by vendor name + date proximity; only set matched_wo_id if there is a clear match):
${wosList}

Notes:
- Return null for any field that isn't present in the document.
- Dates must be ISO YYYY-MM-DD.
- Amounts are numeric (no currency symbols, no commas).
- For utility bills, prefer matching by account_number against the buildings' known utility accounts.
- Be conservative with confidence: 'high' only when fields are unambiguous.`;

  try {
    // Fetch the PDF and base64-encode it. Anthropic's URL-source path requires
    // the URL to be reachable from their fetcher, which sometimes fails for very
    // fresh Supabase Storage URLs. Base64 is universally reliable.
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      res.status(502).json({ error: 'Could not fetch PDF', detail: `HTTP ${pdfRes.status} from ${pdfUrl}` });
      return;
    }
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    const pdfBase64 = pdfBuf.toString('base64');

    const apiRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'classify_parish_document' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      res.status(502).json({ error: 'Anthropic API error', detail: err.slice(0, 500) });
      return;
    }

    const data = await apiRes.json();
    const toolBlock = (data.content || []).find(b => b.type === 'tool_use');
    if (!toolBlock) {
      res.status(502).json({ error: 'No tool_use block in response', raw: JSON.stringify(data).slice(0, 500) });
      return;
    }

    // Frontend resolves building_hint -> building_id by fuzzy match against its in-memory list.
    res.status(200).json(toolBlock.input);
  } catch (e) {
    res.status(500).json({ error: 'Server error', detail: String(e) });
  }
};
