// functions/api/analyze.js
// Calls Anthropic API server-side using the user's stored (encrypted) key.

import { requireSession, getUser, decryptApiKey, json } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const user = await getUser(kv, session.userId);
  if (!user?.anthropicKeyEnc) return json({ error: 'NO_API_KEY' }, 400);

  const apiKey = await decryptApiKey(user.anthropicKeyEnc, env.ENCRYPTION_KEY);

  const { images, condition, notes } = await request.json();
  if (!images || !images.length) return json({ error: 'No images provided' }, 400);

  const prompt = `You are an expert eBay seller specializing in electronics, lab equipment, and tech gear.

Analyze these item photos and generate a complete eBay listing. Condition: "${condition}".
${notes ? `Seller notes: ${notes}` : ''}

Respond ONLY with a valid JSON object (no markdown, no backticks):
{
  "title": "eBay listing title (80 chars max, keyword-rich, no ALL CAPS)",
  "category": "Suggested eBay category path",
  "ebayCategoryId": "Numeric eBay category ID if known, otherwise empty string",
  "conditionId": "eBay condition ID: 1000=New, 1500=New Other, 2000=Certified Refurb, 2500=Seller Refurb, 3000=Used, 7000=For Parts",
  "itemSpecifics": "Key specs as label: value pairs, one per line (Brand: Foo\\nModel: Bar)",
  "price": "Recommended Buy It Now price in USD (number only)",
  "priceLow": "Lowest reasonable price in USD (number only)",
  "priceHigh": "Highest reasonable price in USD (number only)",
  "description": "Full HTML-formatted eBay item description (3-5 paragraphs, use <p> tags)",
  "shippingTip": "Recommended shipping method and estimated box size",
  "searchKeywords": "10-15 comma-separated search keywords"
}`;

  try {
    const content = [
      ...images.map(imageData => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: imageData }
      })),
      { type: 'text', text: prompt }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = data.error?.message || 'Anthropic API error';
      return json({ error: msg }, 502);
    }

    const text = data.content?.map(b => b.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return json(parsed);
  } catch (err) {
    return json({ error: 'Analysis failed: ' + err.message }, 500);
  }
}
