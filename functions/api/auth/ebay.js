// functions/api/auth/ebay.js
// Step 1: Generate eBay Auth 'n' Auth session, redirect user to eBay sign-in

import { getSessionId, ebaySignInUrl } from '../../_ebay.js';
import { randomToken, redirect, stateCookie } from '../../_utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  const kv = env.EBAY_LISTER;

  try {
    // Get a session ID from eBay
    const sessionId = await getSessionId(env);

    // Generate a state token to link the callback back to this session
    const state = randomToken(24);

    // Store sessionId keyed by state (10 min TTL)
    await kv.put(`oauth-state:${state}`, JSON.stringify({ sessionId }), {
      expirationTtl: 600
    });

    // Build the eBay sign-in URL
    const signInUrl = ebaySignInUrl(env.EBAY_RUNAME, sessionId);

    // Redirect user to eBay, set state cookie for callback verification
    return new Response(null, {
      status: 302,
      headers: {
        'Location': signInUrl,
        'Set-Cookie': stateCookie(state)
      }
    });
  } catch (err) {
    // If eBay API is down, show a friendly error
    return new Response(`
      <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{font-family:sans-serif;background:#0d0f12;color:#e8edf2;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}</style>
      </head><body>
        <div style="font-size:18px;font-weight:600;">Unable to connect to eBay</div>
        <div style="color:#8a97a8;font-size:14px;">${err.message}</div>
        <a href="/" style="color:#3b82f6;font-size:14px;">Try again</a>
      </body></html>
    `, { status: 502, headers: { 'Content-Type': 'text/html' } });
  }
}
