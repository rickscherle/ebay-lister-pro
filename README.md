# ListAI v2

eBay listing generator with photo storage, listing history, and direct eBay integration.

Built on Cloudflare Pages + Pages Functions + KV + R2.

---

## Prerequisites

- A Cloudflare account (free tier is sufficient)
- An eBay Developer account (free at developer.ebay.com)
- An Anthropic account (each user brings their own key)
- Git + a GitHub or GitLab account (for Cloudflare Pages CI)

---

## Step 1 — eBay Developer Setup

This is the most involved step. Do it once.

### 1.1 Create an eBay Developer account

Go to https://developer.ebay.com and sign in with your eBay account.

### 1.2 Create an application

1. Go to **My Account → Application Keys**
2. Click **Create an Application Key Set**
3. Name it `ListAI` (or anything you like)
4. Choose **Production** (not Sandbox — Sandbox uses fake accounts)
5. Copy your three credentials:
   - `App ID (Client ID)` → this is `EBAY_APP_ID`
   - `Dev ID` → this is `EBAY_DEV_ID`
   - `Cert ID (Client Secret)` → this is `EBAY_CERT_ID`

### 1.3 Set up your RuName (the OAuth callback URL)

The RuName is eBay's term for the registered redirect URL.

1. In the eBay Developer portal, go to **My Account → User Tokens**
2. Under **Auth'n'Auth Tokens**, click **Get a Token from eBay via Your Application**
3. You'll see a section called **Your Redirect URL** (also called RuName)
4. Set the **Accept URL** (where eBay sends users after sign-in) to:
   ```
   https://your-app.pages.dev/api/auth/callback
   ```
   Replace `your-app.pages.dev` with your actual Cloudflare Pages domain.
5. Set the **Decline URL** to:
   ```
   https://your-app.pages.dev/
   ```
6. Save. eBay will show you your **RuName** — it looks like:
   `YourName-AppName-PRD-xxxxxxxxx-xxxxxxxx`
   Copy it → this is `EBAY_RUNAME`

### 1.4 Request permission scopes

In the eBay portal, under your app's settings, ensure the following OAuth scopes are enabled for Production:

- `https://api.ebay.com/oauth/api_scope` (basic)
- `https://api.ebay.com/oauth/api_scope/sell.inventory` (read/write listings)
- `https://api.ebay.com/oauth/api_scope/sell.fulfillment` (read orders)
- `https://api.ebay.com/oauth/api_scope/sell.account` (policies)

---

## Step 2 — Cloudflare Setup

### 2.1 Create the KV namespace

1. In the Cloudflare dashboard, go to **Workers & Pages → KV**
2. Click **Create a namespace**
3. Name it `EBAY_LISTER`
4. Note the namespace ID

### 2.2 Create the R2 bucket

1. Go to **R2 Object Storage**
2. Click **Create bucket**
3. Name it `listai-photos` (or anything)
4. Note the bucket name

### 2.3 Deploy to Cloudflare Pages

1. Push this repo to GitHub or GitLab
2. In Cloudflare, go to **Workers & Pages → Create Application → Pages → Connect to Git**
3. Select your repo
4. Set the build configuration:
   - **Framework preset:** None
   - **Build command:** *(leave blank)*
   - **Build output directory:** `public`
5. Click **Save and Deploy**
6. Note your Pages URL (e.g. `https://ebay-lister-pro.pages.dev`)

### 2.4 Add KV and R2 bindings

Go to your Pages project → **Settings → Functions**:

**KV namespace bindings:**
| Variable name | KV namespace |
|---|---|
| `EBAY_LISTER` | (select the namespace you created) |

**R2 bucket bindings:**
| Variable name | R2 bucket |
|---|---|
| `PHOTOS` | (select the bucket you created) |

### 2.5 Add environment secrets

Go to your Pages project → **Settings → Environment variables** → **Production**

Add the following as **encrypted secrets** (not plain text variables):

| Variable | Value |
|---|---|
| `EBAY_DEV_ID` | Your eBay Dev ID |
| `EBAY_APP_ID` | Your eBay App ID (Client ID) |
| `EBAY_CERT_ID` | Your eBay Cert ID (Client Secret) |
| `EBAY_RUNAME` | Your eBay RuName |
| `ENCRYPTION_KEY` | A random string, at least 32 characters long |

To generate a good `ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Or use any password manager to generate a 64-character random string.

### 2.6 Redeploy

After adding bindings and secrets, trigger a new deployment:
- Go to **Deployments → Retry deployment**, or
- Push an empty commit: `git commit --allow-empty -m "trigger deploy" && git push`

---

## Step 3 — Update your eBay RuName callback URL

Now that you know your Pages URL, go back to the eBay Developer portal and update the **Accept URL** to exactly:

```
https://ebay-lister-pro.pages.dev/api/auth/callback
```

(Replace `ebay-lister-pro.pages.dev` with your actual domain.)

---

## Step 4 — First sign-in

1. Open your app URL
2. Click **Sign in with eBay**
3. You'll be redirected to eBay to authorize the app
4. After authorizing, you'll land on the dashboard
5. You'll see a banner asking you to add your Anthropic API key — go to Settings and add it

---

## Project Structure

```
ebay-lister-pro/
  public/
    index.html          ← Single-page app
    dark-ui.css         ← UI toolkit
    _redirects          ← SPA routing for Cloudflare Pages
  functions/
    _utils.js           ← Sessions, encryption, KV helpers
    _ebay.js            ← eBay Trading API XML layer
    api/
      auth/
        ebay.js         ← Step 1: generate eBay session, redirect to sign-in
        callback.js     ← Step 2: exchange token, create session
        logout.js       ← Clear session
      me.js             ← Current user info
      settings.js       ← Anthropic key (encrypted GET/POST/DELETE)
      dashboard.js      ← Sync with eBay, return counts
      analyze.js        ← Call Anthropic API server-side
      listings/
        index.js        ← GET list, POST create
        [id].js         ← GET, PUT, DELETE single listing
        [id]/
          photos.js     ← POST upload photo
          photos/
            [photoId].js ← DELETE single photo
      photos/
        [[path]].js     ← GET serve photo from R2
      ebay/
        push.js         ← VerifyAddItem (draft push)
        sync.js         ← Manual eBay sync
  push.bat              ← Git add/commit/push helper (Windows)
```

---

## Data Model

### KV keys

| Key | Value |
|---|---|
| `session:{token}` | `{ userId, createdAt }` — 30 day TTL |
| `oauth-state:{state}` | `{ sessionId }` — 10 min TTL |
| `user:{userId}` | User record (see below) |
| `listings:{userId}` | Array of listing objects |

### User record
```json
{
  "userId": "ebay-username",
  "displayName": "ebay-username",
  "email": "user@example.com",
  "ebayToken": "...",
  "ebayTokenExpiresAt": "2027-01-01T00:00:00.000Z",
  "anthropicKeyEnc": "hex-encoded-aes-gcm-ciphertext",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000
}
```

The Anthropic key is encrypted with AES-GCM (256-bit) using the `ENCRYPTION_KEY` secret before storage. It is never returned to the browser.

### R2 object keys

```
photos/{userId}/{photoId}.jpg         ← Full size (max 1024px)
photos/{userId}/{photoId}_thumb.jpg   ← Thumbnail (max 200px)
```

---

## Listing statuses

| Status | Meaning |
|---|---|
| `new` | Generated by AI, not yet pushed to eBay |
| `draft` | Passed eBay's VerifyAddItem check — ready to publish in Seller Hub |
| `listed` | Live on eBay (detected by sync) |
| `sold` | Completed order detected by sync |

---

## Cost estimates (free tiers)

| Service | Free tier | ListAI usage |
|---|---|---|
| Cloudflare Pages | Unlimited requests | Frontend hosting |
| Cloudflare Functions | 100k requests/day | API calls |
| Cloudflare KV | 1 GB storage, 100k reads/day | Sessions + listing metadata |
| Cloudflare R2 | 10 GB storage, 1M writes/month | Photos |
| Anthropic API | $5 new account credit | ~$0.02 per listing |
| eBay Developer API | Free | Auth + listing sync |

A typical single-user deployment costs $0/month on Cloudflare. Users pay Anthropic directly for AI usage.
