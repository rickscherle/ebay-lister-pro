// functions/api/listings/index.js
import { requireSession, getListings, saveListings, newListingId, json } from '../../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const url = new URL(request.url);
  const filter = url.searchParams.get('status') || 'all';
  const q = (url.searchParams.get('q') || '').toLowerCase();

  let listings = await getListings(kv, session.userId);

  // Filter by status
  if (filter !== 'all') {
    listings = listings.filter(l => l.status === filter);
  }

  // Search filter
  if (q) {
    listings = listings.filter(l =>
      (l.title || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q)
    );
  }

  // Sort newest first
  listings.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return json(listings);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const body = await request.json();
  const {
    title, category, ebayCategoryId, conditionId,
    price, description, itemSpecifics, searchKeywords,
    shippingTip, condition, notes, imageCount, photoIds
  } = body;

  if (!title) return json({ error: 'Title is required' }, 400);

  const listing = {
    id: newListingId(),
    status: 'new',
    title,
    category: category || '',
    ebayCategoryId: ebayCategoryId || '',
    conditionId: conditionId || '',
    condition: condition || '',
    price: parseFloat(price) || 0,
    description: description || '',
    itemSpecifics: itemSpecifics || '',
    searchKeywords: searchKeywords || '',
    shippingTip: shippingTip || '',
    notes: notes || '',
    imageCount: imageCount || 0,
    photoIds: photoIds || [],
    ebayItemId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const listings = await getListings(kv, session.userId);
  listings.unshift(listing);
  if (listings.length > 200) listings.splice(200);
  await saveListings(kv, session.userId, listings);

  return json(listing, 201);
}
