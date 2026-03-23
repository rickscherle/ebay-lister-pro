// functions/api/dashboard.js
// Returns counts for all status categories. Syncs with eBay on every call.

import { requireSession, getUser, getListings, saveListings, json } from '../_utils.js';
import { getActiveListings, getSoldOrders } from '../_ebay.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const user = await getUser(kv, session.userId);
  if (!user) return json({ error: 'User not found' }, 404);

  const listings = await getListings(kv, session.userId);

  // Count local statuses
  const counts = {
    new: 0,      // generated, not yet pushed to eBay
    draft: 0,    // pushed to eBay as draft
    listed: 0,   // live on eBay (from sync)
    sold: 0,     // sold on eBay (from sync)
    total: listings.length,
    synced: false,
    syncError: null,
  };

  for (const l of listings) {
    if (counts[l.status] !== undefined) counts[l.status]++;
  }

  // Attempt eBay sync if user has a token
  if (user.ebayToken) {
    try {
      // Get active listings from eBay
      const ebayListings = await getActiveListings(user.ebayToken, env);
      const ebayActiveIds = new Set(ebayListings.map(l => l.ebayItemId));

      // Get sold orders from eBay
      const soldOrders = await getSoldOrders(user.ebayToken, env);
      const soldItemIds = new Set(soldOrders.map(o => o.ebayItemId));

      // Update statuses of listings we know about
      let changed = false;
      for (const listing of listings) {
        if (!listing.ebayItemId) continue;
        const newStatus = soldItemIds.has(listing.ebayItemId) ? 'sold'
          : ebayActiveIds.has(listing.ebayItemId) ? 'listed'
          : listing.status; // keep draft if no longer found (could have been ended)

        if (newStatus !== listing.status) {
          listing.status = newStatus;
          listing.updatedAt = Date.now();
          changed = true;
        }
      }

      if (changed) await saveListings(kv, session.userId, listings);

      // Recount after sync
      counts.new = counts.draft = counts.listed = counts.sold = 0;
      for (const l of listings) {
        if (counts[l.status] !== undefined) counts[l.status]++;
      }

      counts.synced = true;
      counts.syncedAt = Date.now();
    } catch (err) {
      counts.syncError = 'eBay sync failed — showing last known data';
    }
  }

  return json(counts);
}
