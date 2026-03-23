// functions/api/auth/logout.js
import { getSession, deleteSession, clearSessionCookie, json } from '../../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;
  const session = await getSession(request, kv);
  if (session) await deleteSession(kv, session.token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie()
    }
  });
}
