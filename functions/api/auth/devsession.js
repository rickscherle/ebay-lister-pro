// functions/api/auth/devsession.js
// Temporary dev bypass — sets the session:dev cookie directly.
// Remove this file before opening the app to other users.

import { sessionCookie } from '../../_utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  const kv = env.EBAY_LISTER;

  // Only works if session:dev exists in KV
  const session = await kv.get('session:dev', 'json');
  if (!session) {
    return new Response('Dev session not found in KV. Add session:dev manually.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': `session=dev; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
    }
  });
}
