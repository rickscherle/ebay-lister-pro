// functions/api/ebay/push.js
// Pushes a listing to eBay as a draft using VerifyAddItem.
// Full AddItem publish will come in the guided publish screen (v2.1).

import { requireSession, getUser, getListings, saveListings, json } from '../../_utils.js';
import { addItemDraft } from '../../_ebay.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const user = await getUser(kv, session.userId);
  if (!user?.ebayToken) return json({ error: 'No eBay token found. Please sign in again.' }, 401);

  const { listingId } = await request.json();
  if (!listingId) return json({ error: 'Missing listingId' }, 400);

  const listings = await getListings(kv, session.userId);
  const listingIdx = listings.findIndex(l => l.id === listingId);
  if (listingIdx === -1) return json({ error: 'Listing not found' }, 404);

  const listing = listings[listingIdx];

  try {
    const result = await addItemDraft(listing, user.ebayToken, env);

    if (result.ok) {
      // VerifyAddItem succeeded — listing is valid
      // Mark as draft in our system
      listings[listingIdx].status = 'draft';
      listings[listingIdx].ebayVerifiedAt = Date.now();
      listings[listingIdx].updatedAt = Date.now();
      await saveListings(kv, session.userId, listings);

      return json({
        ok: true,
        message: 'Listing verified and saved as draft. Use eBay Seller Hub to publish.',
        fees: result.xml.includes('Fees') ? 'See eBay for fee details.' : null,
        errors: result.errors.filter(e => e.severity === 'Warning'),
      });
    } else {
      return json({
        ok: false,
        errors: result.errors,
        message: result.errors[0]?.message || 'eBay rejected the listing.',
      }, 422);
    }
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
