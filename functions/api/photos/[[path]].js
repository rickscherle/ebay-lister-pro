// functions/api/photos/[[path]].js
// Serves photos from R2. Auth-gated: only the owning user may fetch.
// URL: GET /api/photos/{userId}/{filename}
//      filename is either {photoId}.jpg or {photoId}_thumb.jpg

import { requireSession } from '../../_utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const kv = env.EBAY_LISTER;
  const r2 = env.PHOTOS;

  const parts = params.path;
  if (!parts || parts.length < 2) return new Response('Not found', { status: 404 });

  const [userId, filename] = parts;

  const { session, error } = await requireSession(request, kv);
  if (error) return new Response('Unauthorized', { status: 401 });
  if (session.userId !== userId) return new Response('Forbidden', { status: 403 });

  const object = await r2.get(`photos/${userId}/${filename}`);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    }
  });
}
