// functions/_utils.js
// Shared helpers: sessions, cookies, encryption, response builders

// ── Response helpers ──────────────────────────────────────────────────────────
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

export function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}

// ── Cookie helpers ────────────────────────────────────────────────────────────
export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=');
  });
  return cookies;
}

export function sessionCookie(token) {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`; // 30 days
}

export function clearSessionCookie() {
  return `session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function stateCookie(token) {
  return `oauth_state=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`; // 10 min
}

// ── Token generation ──────────────────────────────────────────────────────────
export function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Session management ────────────────────────────────────────────────────────
export async function createSession(kv, userId) {
  const token = randomToken(32);
  await kv.put(`session:${token}`, JSON.stringify({
    userId,
    createdAt: Date.now()
  }), { expirationTtl: 2592000 }); // 30 days
  return token;
}

export async function getSession(request, kv) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies.session;
  if (!token) return null;
  const data = await kv.get(`session:${token}`, 'json');
  if (!data) return null;
  return { token, ...data };
}

export async function deleteSession(kv, token) {
  await kv.delete(`session:${token}`);
}

// ── Auth middleware ───────────────────────────────────────────────────────────
export async function requireSession(request, kv) {
  const session = await getSession(request, kv);
  if (!session) return { session: null, error: json({ error: 'Not authenticated' }, 401) };
  return { session, error: null };
}

// ── Anthropic key encryption (AES-GCM) ───────────────────────────────────────
async function getEncryptionKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('ebay-lister-pro-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptApiKey(plaintext, secret) {
  const key = await getEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  // Store iv + ciphertext as hex
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return Array.from(combined).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function decryptApiKey(hex, secret) {
  const key = await getEncryptionKey(secret);
  const bytes = Uint8Array.from(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

export function maskApiKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return '••••••••••••••••' + key.slice(-4);
}

// ── User helpers ──────────────────────────────────────────────────────────────
export async function getUser(kv, userId) {
  return kv.get(`user:${userId}`, 'json');
}

export async function saveUser(kv, userId, data) {
  await kv.put(`user:${userId}`, JSON.stringify(data));
}

// ── Listing helpers ───────────────────────────────────────────────────────────
export async function getListings(kv, userId) {
  return (await kv.get(`listings:${userId}`, 'json')) || [];
}

export async function saveListings(kv, userId, listings) {
  await kv.put(`listings:${userId}`, JSON.stringify(listings));
}

export function newListingId() {
  return crypto.randomUUID();
}

export function newPhotoId() {
  return crypto.randomUUID();
}
