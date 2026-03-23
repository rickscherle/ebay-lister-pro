// functions/api/auth/callback.js
// eBay Auth'n'Auth sends the token directly in the callback URL as ?ebaytkn=...
// We read it from the URL params, create/update the user record, and set a session.

import { getEbayUser } from '../../_ebay.js';
import { parseCookies, createSession, sessionCookie, saveUser, getUser } from '../../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;
  const url = new URL(request.url);

  // eBay sends the token directly in the URL
  const ebayToken  = url.searchParams.get('ebaytkn')  || '';
  const tknexp     = url.searchParams.get('tknexp')   || '';
  const username   = url.searchParams.get('username') || '';

  if (!ebayToken) {
    return errorPage(
      'eBay did not return a token. This can happen if you declined access or if the session expired. Please try again.',
      '/'
    );
  }

  try {
    // Get full eBay user info using the token
    let ebayUser;
    try {
      ebayUser = await getEbayUser(ebayToken, env);
    } catch(e) {
      // Fall back to username from URL if GetUser fails
      ebayUser = { userId: username, email: '' };
    }

    const userId = ebayUser.userId || username;
    if (!userId) return errorPage('Could not determine eBay username.', '/');

    // Load or create user record
    const existing = await getUser(kv, userId);
    await saveUser(kv, userId, {
      ...(existing || {}),
      userId,
      displayName: userId,
      email: ebayUser.email || existing?.email || '',
      ebayToken,
      ebayTokenExpiresAt: tknexp,
      updatedAt: Date.now(),
      createdAt: existing?.createdAt || Date.now(),
    });

    // Create app session
    const sessionToken = await createSession(kv, userId);

    // Clear state cookie, set session cookie, redirect to app
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': [
          sessionCookie(sessionToken),
          'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
        ].join(', ')
      }
    });

  } catch (err) {
    return errorPage('Sign-in failed: ' + err.message, '/');
  }
}

function errorPage(message, backUrl) {
  return new Response(`
    <!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body { font-family: sans-serif; background: #0d0f12; color: #e8edf2;
               display: flex; align-items: center; justify-content: center;
               height: 100vh; margin: 0; flex-direction: column; gap: 12px;
               text-align: center; padding: 20px; }
      </style>
    </head><body>
      <div style="font-size:18px;font-weight:600">Sign-in error</div>
      <div style="color:#8a97a8;font-size:14px;max-width:320px">${message}</div>
      <a href="${backUrl}" style="color:#3b82f6;font-size:14px;margin-top:8px">← Try again</a>
    </body></html>
  `, { status: 400, headers: { 'Content-Type': 'text/html' } });
}
