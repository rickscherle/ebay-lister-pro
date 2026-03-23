// functions/api/listings/[id]/photos.js
// POST /api/listings/{id}/photos — upload a new photo to a listing

import { requireSession, getListings, saveListings, newPhotoId, json } from '../../../_utils.js';

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const kv = env.EBAY_LISTER;
  const r2 = env.PHOTOS;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const listingId = params.id;
  const listings = await getListings(kv, session.userId);
  const idx = listings.findIndex(l => l.id === listingId);
  if (idx === -1) return json({ error: 'Listing not found' }, 404);

  const listing = listings[idx];
  if ((listing.photoIds || []).length >= 6) {
    return json({ error: 'Maximum 6 photos per listing' }, 400);
  }

  const { full, thumb } = await request.json();
  if (!full) return json({ error: 'No image data' }, 400);

  const photoId = newPhotoId();

  // Upload full image
  const fullBytes = Uint8Array.from(atob(full), c => c.charCodeAt(0));
  await r2.put(`photos/${session.userId}/${photoId}.jpg`, fullBytes, {
    httpMetadata: { contentType: 'image/jpeg' }
  });

  // Upload thumbnail
  if (thumb) {
    const base64 = thumb.includes(',') ? thumb.split(',')[1] : thumb;
    const thumbBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    await r2.put(`photos/${session.userId}/${photoId}_thumb.jpg`, thumbBytes, {
      httpMetadata: { contentType: 'image/jpeg' }
    });
  }

  if (!listing.photoIds) listing.photoIds = [];
  listing.photoIds.push(photoId);
  listing.imageCount = listing.photoIds.length;
  listing.updatedAt = Date.now();

  await saveListings(kv, session.userId, listings);

  return json({ photoId, imageCount: listing.imageCount }, 201);
}
