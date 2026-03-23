// functions/_ebay.js
// eBay Trading API (XML) helper layer

const TRADING_URL = 'https://api.ebay.com/ws/api.dll';
const COMPAT_LEVEL = '1225';
const SITE_ID = '0'; // US

// ── Core XML call ─────────────────────────────────────────────────────────────
export async function tradingCall(callName, xmlBody, env, userToken = null) {
  const authBlock = userToken
    ? `<RequesterCredentials><eBayAuthToken>${userToken}</eBayAuthToken></RequesterCredentials>`
    : `<RequesterCredentials><DevId>${env.EBAY_DEV_ID}</DevId><AppId>${env.EBAY_APP_ID}</AppId><AuthCert>${env.EBAY_CERT_ID}</AuthCert></RequesterCredentials>`;

  const body = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  ${authBlock}
  ${xmlBody}
</${callName}Request>`;

  const res = await fetch(TRADING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-COMPATIBILITY-LEVEL': COMPAT_LEVEL,
      'X-EBAY-API-DEV-NAME': env.EBAY_DEV_ID,
      'X-EBAY-API-APP-NAME': env.EBAY_APP_ID,
      'X-EBAY-API-CERT-NAME': env.EBAY_CERT_ID,
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-SITEID': SITE_ID,
    },
    body
  });

  const xml = await res.text();
  const ack = xmlVal(xml, 'Ack');
  const errors = extractErrors(xml);
  return { xml, ack, errors, ok: ack === 'Success' || ack === 'Warning' };
}

// ── XML helpers ───────────────────────────────────────────────────────────────
export function xmlVal(xml, tag) {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'm'));
  return m ? m[1].trim() : null;
}

export function xmlVals(xml, tag) {
  if (!xml) return [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gm');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

export function xmlBlock(xml, tag) {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'm'));
  return m ? m[1] : null;
}

export function xmlBlocks(xml, tag) {
  if (!xml) return [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gm');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

function extractErrors(xml) {
  return xmlBlocks(xml, 'Errors').map(b => ({
    code: xmlVal(b, 'ErrorCode'),
    message: xmlVal(b, 'LongMessage') || xmlVal(b, 'ShortMessage'),
    severity: xmlVal(b, 'SeverityCode')
  }));
}

// ── Auth 'n' Auth flow ────────────────────────────────────────────────────────
export async function getSessionId(env) {
  const result = await tradingCall('GetSessionID',
    `<RuName>${env.EBAY_RUNAME}</RuName>`, env);
  if (!result.ok) throw new Error('GetSessionID failed: ' + (result.errors[0]?.message || 'Unknown'));
  return xmlVal(result.xml, 'SessionID');
}

export async function fetchToken(sessionId, env) {
  const result = await tradingCall('FetchToken',
    `<SessionID>${sessionId}</SessionID>`, env);
  if (!result.ok) throw new Error('FetchToken failed: ' + (result.errors[0]?.message || 'Unknown'));
  return {
    token: xmlVal(result.xml, 'eBayAuthToken'),
    expiresAt: xmlVal(result.xml, 'HardExpirationTime'),
  };
}

export function ebaySignInUrl(ruName, sessionId) {
  return `https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&runame=${encodeURIComponent(ruName)}&SessID=${encodeURIComponent(sessionId)}`;
}

// ── User info ─────────────────────────────────────────────────────────────────
export async function getEbayUser(token, env) {
  const result = await tradingCall('GetUser',
    '<DetailLevel>ReturnAll</DetailLevel>', env, token);
  if (!result.ok) throw new Error('GetUser failed: ' + (result.errors[0]?.message || 'Unknown'));
  const userBlock = xmlBlock(result.xml, 'User');
  return {
    userId: xmlVal(userBlock, 'UserID'),
    email: xmlVal(userBlock, 'Email'),
    feedbackScore: xmlVal(userBlock, 'FeedbackScore'),
  };
}

// ── Selling counts (one call, parse each section separately) ──────────────────
export async function getMySellingCounts(token, env) {
  const result = await tradingCall('GetMyeBaySelling', `
    <ActiveList>
      <Include>true</Include>
      <Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
    </ActiveList>
    <SoldList>
      <Include>true</Include>
      <DurationInDays>60</DurationInDays>
      <Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
    </SoldList>
    <UnsoldList>
      <Include>true</Include>
      <Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
    </UnsoldList>
  `, env, token);

  if (!result.ok) return { listed: 0, sold: 0, unsold: 0 };

  // Each section has its own PaginationResult — parse the parent block first,
  // then extract TotalNumberOfEntries from within it.
  function countFromSection(xml, sectionTag) {
    const section = xmlBlock(xml, sectionTag);
    if (!section) return 0;
    const pagResult = xmlBlock(section, 'PaginationResult');
    if (!pagResult) return 0;
    return parseInt(xmlVal(pagResult, 'TotalNumberOfEntries') || '0', 10);
  }

  return {
    listed: countFromSection(result.xml, 'ActiveList'),
    sold:   countFromSection(result.xml, 'SoldList'),
    unsold: countFromSection(result.xml, 'UnsoldList'),
  };
}

// ── Active listings (full data for sync) ──────────────────────────────────────
export async function getActiveListings(token, env, page = 1) {
  const result = await tradingCall('GetMyeBaySelling', `
    <ActiveList>
      <Include>true</Include>
      <Pagination><EntriesPerPage>50</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>
    </ActiveList>
  `, env, token);

  if (!result.ok) return [];

  const activeBlock = xmlBlock(result.xml, 'ActiveList');
  if (!activeBlock) return [];

  return xmlBlocks(activeBlock, 'Item').map(b => ({
    ebayItemId: xmlVal(b, 'ItemID'),
    title: xmlVal(b, 'Title'),
    price: parseFloat(xmlVal(b, 'BuyItNowPrice') || xmlVal(b, 'CurrentPrice') || '0'),
    endTime: xmlVal(b, 'EndTime'),
    status: 'listed',
  }));
}

// ── Sold orders ───────────────────────────────────────────────────────────────
export async function getSoldOrders(token, env, daysPast = 60) {
  const from = new Date(Date.now() - daysPast * 86400000).toISOString();
  const to   = new Date().toISOString();

  const result = await tradingCall('GetOrders', `
    <CreateTimeFrom>${from}</CreateTimeFrom>
    <CreateTimeTo>${to}</CreateTimeTo>
    <OrderStatus>Completed</OrderStatus>
    <Pagination><EntriesPerPage>50</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  `, env, token);

  if (!result.ok) return [];

  const sold = [];
  for (const order of xmlBlocks(result.xml, 'Order')) {
    for (const t of xmlBlocks(order, 'Transaction')) {
      const item = xmlBlock(t, 'Item');
      sold.push({
        ebayItemId: xmlVal(item, 'ItemID'),
        title:      xmlVal(item, 'Title'),
        salePrice:  parseFloat(xmlVal(t, 'TransactionPrice') || '0'),
        soldAt:     xmlVal(order, 'CreatedTime'),
        orderId:    xmlVal(order, 'OrderID'),
        buyer:      xmlVal(xmlBlock(order, 'Buyer'), 'UserID'),
      });
    }
  }
  return sold;
}

// ── Push to eBay as draft (VerifyAddItem) ─────────────────────────────────────
export async function addItemDraft(listing, token, env) {
  const specificsXml = (listing.itemSpecifics || '')
    .split('\n')
    .filter(line => line.includes(':'))
    .map(line => {
      const [name, ...rest] = line.split(':');
      return `<NameValueList><n>${esc(name.trim())}</n><Value>${esc(rest.join(':').trim())}</Value></NameValueList>`;
    }).join('');

  const xml = `
    <Item>
      <Title>${esc(listing.title)}</Title>
      <Description><![CDATA[${listing.description || ''}]]></Description>
      <PrimaryCategory><CategoryID>${listing.ebayCategoryId || '99'}</CategoryID></PrimaryCategory>
      <StartPrice>${listing.price || 0}</StartPrice>
      <ConditionID>${listing.conditionId || '3000'}</ConditionID>
      <Country>US</Country>
      <Currency>USD</Currency>
      <DispatchTimeMax>3</DispatchTimeMax>
      <ListingDuration>GTC</ListingDuration>
      <ListingType>FixedPriceItem</ListingType>
      <Location>United States</Location>
      <Quantity>1</Quantity>
      <ItemSpecifics>${specificsXml}</ItemSpecifics>
    </Item>`;

  return tradingCall('VerifyAddItem', xml, env, token);
}

function esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
