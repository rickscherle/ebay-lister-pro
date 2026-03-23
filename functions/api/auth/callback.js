// functions/api/auth/callback.js
// Step 2: eBay redirects here after user authorizes.
// We exchange the session ID for a token, create our session, redirect to app.

import { fetchToken, getEbayUser } from '../../_ebay.js';
import { parseCookies, createSession, sessionCookie, saveUser, getUser, redirect } from '../../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;
  const url = new URL(request.url);

  // Read state from cookie
  const cookies = parseCookies(request.headers.get('Cookie'));
  const state = cookies.oauth_state;

  if (!state) return errorPage('Session expired. Please try signing in again.', '/');

  // Retrieve sessionId from KV
  const stateData = await kv.get(`oauth-state:${state}`, 'json');
  if (!stateData) return errorPage('OAuth state not found or expired.', '/');

  const { sessionId } = stateData;
  await kv.delete(`oauth-state:${state}`);

  try {
    // Exchange sessionId for eBay user token
    const { token, expiresAt } = await fetchToken(sessionId, env);

    // Get eBay user info
    const ebayUser = await getEbayUser(token, env);
    const userId = ebayUser.userId;

    // Load or create user record
    const existing = await getUser(kv, userId);
    await saveUser(kv, userId, {
      ...(existing || {}),
      userId,
      displayName: userId,
      email: ebayUser.email,
      ebayToken: token,
      ebayTokenExpiresAt: expiresAt,
      updatedAt: Date.now(),
      createdAt: existing?.createdAt || Date.now(),
    });

    // Create app session
    const sessionToken = await createSession(kv, userId);

    // Redirect to app with session cookie (clear state cookie)
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': [
          sessionCookie(sessionToken),
          'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        ].join(', ')
      }
    });
  } catch (err) {
    return errorPage(`Sign-in failed: ${err.message}`, '/');
  }
}

function errorPage(message, backUrl) {
  return new Response(`
    <!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:sans-serif;background:#0d0f12;color:#e8edf2;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;text-align:center;padding:20px;}</style>
    </head><body>
      <div style="font-size:18px;font-weight:600;">Sign-in error</div>
      <div style="color:#8a97a8;font-size:14px;max-width:320px;">${message}</div>
      <a href="${backUrl}" style="color:#3b82f6;font-size:14px;margin-top:8px;">← Back</a>
    </body></html>
  `, { status: 400, headers: { 'Content-Type': 'text/html' } });
}
