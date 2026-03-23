// functions/api/me.js
import { requireSession, getUser, maskApiKey, json } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const user = await getUser(kv, session.userId);
  if (!user) return json({ error: 'User not found' }, 404);

  return json({
    userId: user.userId,
    displayName: user.displayName,
    email: user.email,
    hasApiKey: !!user.anthropicKeyEnc,
    maskedKey: user.anthropicKeyEnc ? maskApiKey(user.anthropicKeyEnc) : null,
  });
}
