// functions/api/ebay/sync.js
// Manual sync — same logic as dashboard.js but returns the updated listings array.

import { requireSession, getUser, getListings, saveListings, json } from '../../_utils.js';
import { getActiveListings, getSoldOrders } from '../../_ebay.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const user = await getUser(kv, session.userId);
  if (!user?.ebayToken) return json({ error: 'No eBay token' }, 401);

  try {
    const [ebayListings, soldOrders] = await Promise.all([
      getActiveListings(user.ebayToken, env),
      getSoldOrders(user.ebayToken, env),
    ]);

    const ebayActiveIds = new Set(ebayListings.map(l => l.ebayItemId));
    const soldItemIds = new Set(soldOrders.map(o => o.ebayItemId));

    const listings = await getListings(kv, session.userId);
    let changed = 0;

    for (const listing of listings) {
      if (!listing.ebayItemId) continue;
      const newStatus = soldItemIds.has(listing.ebayItemId) ? 'sold'
        : ebayActiveIds.has(listing.ebayItemId) ? 'listed'
        : listing.status;
      if (newStatus !== listing.status) {
        listing.status = newStatus;
        listing.updatedAt = Date.now();
        changed++;
      }
    }

    if (changed > 0) await saveListings(kv, session.userId, listings);

    return json({
      ok: true,
      changed,
      syncedAt: Date.now(),
      counts: {
        new: listings.filter(l => l.status === 'new').length,
        draft: listings.filter(l => l.status === 'draft').length,
        listed: listings.filter(l => l.status === 'listed').length,
        sold: listings.filter(l => l.status === 'sold').length,
      }
    });
  } catch (err) {
    return json({ error: 'Sync failed: ' + err.message }, 500);
  }
}
