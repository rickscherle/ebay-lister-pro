// functions/api/listings/[id]/photos/[photoId].js
// DELETE /api/listings/{id}/photos/{photoId} — remove one photo

import { requireSession, getListings, saveListings, json } from '../../../../_utils.js';

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const kv = env.EBAY_LISTER;
  const r2 = env.PHOTOS;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const { id: listingId, photoId } = params;

  const listings = await getListings(kv, session.userId);
  const idx = listings.findIndex(l => l.id === listingId);
  if (idx === -1) return json({ error: 'Listing not found' }, 404);

  // Delete both files from R2 (ignore if they don't exist)
  await Promise.allSettled([
    r2.delete(`photos/${session.userId}/${photoId}.jpg`),
    r2.delete(`photos/${session.userId}/${photoId}_thumb.jpg`),
  ]);

  // Remove from listing record
  const listing = listings[idx];
  listing.photoIds = (listing.photoIds || []).filter(p => p !== photoId);
  listing.imageCount = listing.photoIds.length;
  listing.updatedAt = Date.now();

  await saveListings(kv, session.userId, listings);

  return json({ ok: true, imageCount: listing.imageCount });
}
