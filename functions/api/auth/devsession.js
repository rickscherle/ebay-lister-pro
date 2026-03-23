// functions/api/auth/devsession.js
// Temporary dev bypass — sets the session:dev cookie directly.
// Protected by DEV_PASSPHRASE secret. Remove before opening to other users.

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  // Check passphrase from query string: /api/auth/devsession?p=yourpassphrase
  const url = new URL(request.url);
  const passphrase = url.searchParams.get('p') || '';
  const expected = env.DEV_PASSPHRASE || '';

  if (!expected || passphrase !== expected) {
    return new Response('Not found', { status: 404 });
  }

  const session = await kv.get('session:dev', 'json');
  if (!session) {
    return new Response('Dev session not found in KV.', {
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
