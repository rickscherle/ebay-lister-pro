// functions/api/listings/[id].js
import { requireSession, getListings, saveListings, json } from '../../_utils.js';

async function findListing(kv, userId, id) {
  const listings = await getListings(kv, userId);
  const idx = listings.findIndex(l => l.id === id);
  return { listings, idx };
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const { listings, idx } = await findListing(kv, session.userId, params.id);
  if (idx === -1) return json({ error: 'Not found' }, 404);

  return json(listings[idx]);
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const { listings, idx } = await findListing(kv, session.userId, params.id);
  if (idx === -1) return json({ error: 'Not found' }, 404);

  const updates = await request.json();

  // Whitelist updatable fields — never allow overwriting id, userId, createdAt
  const allowed = [
    'title', 'category', 'ebayCategoryId', 'conditionId', 'condition',
    'price', 'description', 'itemSpecifics', 'searchKeywords',
    'shippingTip', 'notes', 'status', 'ebayItemId', 'photoIds', 'imageCount'
  ];

  for (const key of allowed) {
    if (key in updates) listings[idx][key] = updates[key];
  }
  listings[idx].updatedAt = Date.now();

  await saveListings(kv, session.userId, listings);
  return json(listings[idx]);
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const kv = env.EBAY_LISTER;
  const r2 = env.PHOTOS;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const { listings, idx } = await findListing(kv, session.userId, params.id);
  if (idx === -1) return json({ error: 'Not found' }, 404);

  const listing = listings[idx];

  // Delete all photos from R2
  if (listing.photoIds && listing.photoIds.length > 0) {
    await Promise.all(listing.photoIds.flatMap(pid => [
      r2.delete(`photos/${session.userId}/${pid}.jpg`),
      r2.delete(`photos/${session.userId}/${pid}_thumb.jpg`),
    ]));
  }

  listings.splice(idx, 1);
  await saveListings(kv, session.userId, listings);

  return json({ ok: true });
}
