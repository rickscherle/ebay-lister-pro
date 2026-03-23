// functions/api/settings.js
import { requireSession, getUser, saveUser, encryptApiKey, maskApiKey, json } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const user = await getUser(kv, session.userId);
  return json({
    hasApiKey: !!user?.anthropicKeyEnc,
    maskedKey: user?.anthropicKeyEnc ? maskApiKey(user.anthropicKeyEnc) : null,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const { anthropicKey } = await request.json();
  if (!anthropicKey || !anthropicKey.startsWith('sk-ant-')) {
    return json({ error: 'Invalid API key format' }, 400);
  }

  const user = await getUser(kv, session.userId);
  if (!user) return json({ error: 'User not found' }, 404);

  // Encrypt before storing — key never stored in plain text
  const encrypted = await encryptApiKey(anthropicKey, env.ENCRYPTION_KEY);

  await saveUser(kv, session.userId, {
    ...user,
    anthropicKeyEnc: encrypted,
    updatedAt: Date.now(),
  });

  return json({
    ok: true,
    maskedKey: maskApiKey(anthropicKey),
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const kv = env.EBAY_LISTER;

  const { session, error } = await requireSession(request, kv);
  if (error) return error;

  const user = await getUser(kv, session.userId);
  if (!user) return json({ error: 'User not found' }, 404);

  const { anthropicKeyEnc: _, ...rest } = user;
  await saveUser(kv, session.userId, { ...rest, updatedAt: Date.now() });

  return json({ ok: true });
}
