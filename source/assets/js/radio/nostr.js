import { SimplePool } from '/assets/js/vendor/nostr-pool.js';
import * as nip19 from '/assets/js/vendor/nostr-nip19.js';

const PROFILE_CACHE = new Map();

let pool = null;
let streamPubkey = null;
let streamIdentifier = null;
let streamATag = null;
let relays = [];
let profilePubkey = null;

// Mux state — one subscription handles all event kinds
let muxEosed = false;
let zapHistoryDelivered = false;
let chatHistoryDelivered = false;
let raidHistoryDelivered = false;
let streamInfoCb = null;
let zapCb = null;
let zapEoseCb = null;
let chatCb = null;
let chatEoseCb = null;
let raidCb = null;
let raidEoseCb = null;
const pendingStreamInfo = [];
const historicalZaps = [];
const historicalChat = [];
const historicalRaids = [];

function startMux() {
  const filters = [
    { kinds: [30311], authors: [streamPubkey], '#d': [streamIdentifier] },
    { kinds: [9735], '#a': [streamATag], limit: 200 },
    ...(profilePubkey ? [{ kinds: [9735], '#p': [profilePubkey], limit: 200 }] : []),
    { kinds: [1311], '#a': [streamATag], limit: 50 },
    { kinds: [1312], '#a': [streamATag], limit: 10 },
  ];
  const requests = relays.flatMap(url => filters.map(filter => ({ url, filter })));

  function triggerEose() {
    if (muxEosed) return;
    muxEosed = true;
    deliverHistoricalZaps();
    deliverHistoricalChat();
    deliverHistoricalRaids();
  }

  setTimeout(triggerEose, 2000);

  pool.subscribeMap(requests,
    {
      onevent(event) {
        if (event.kind === 30311) {
          const info = parseStreamEvent(event);
          if (streamInfoCb) streamInfoCb(info);
          else pendingStreamInfo.push(info);
        } else if (event.kind === 9735) {
          const isStreamZap  = event.tags.some(t => t[0] === 'a' && t[1] === streamATag);
          const isProfileZap = profilePubkey && event.tags.some(t => t[0] === 'p' && t[1] === profilePubkey);
          if (!isStreamZap && !isProfileZap) return;
          if (!muxEosed) {
            historicalZaps.push(event);
          } else {
            const zap = parseZapReceipt(event);
            if (zap && zapCb) zapCb({ ...zap, isStreamZap }, false);
          }
        } else if (event.kind === 1311) {
          if (!muxEosed) {
            historicalChat.push(event);
          } else {
            if (chatCb) chatCb(parseChatMessage(event), false);
          }
        } else if (event.kind === 1312) {
          if (!muxEosed) {
            historicalRaids.push(event);
          } else {
            if (raidCb) raidCb({ pubkey: event.pubkey, content: event.content, timestamp: event.created_at }, false);
          }
        }
      },
      oneose() {
        triggerEose();
      },
    }
  );
}

function deliverHistoricalZaps() {
  if (zapHistoryDelivered || !zapCb) return;
  zapHistoryDelivered = true;
  historicalZaps
    .sort((a, b) => a.created_at - b.created_at)
    .forEach(event => {
      const zap = parseZapReceipt(event);
      const isStreamZap = event.tags.some(t => t[0] === 'a' && t[1] === streamATag);
      if (zap) zapCb({ ...zap, isStreamZap }, true);
    });
  if (zapEoseCb) zapEoseCb();
}

function deliverHistoricalChat() {
  if (chatHistoryDelivered || !chatCb) return;
  chatHistoryDelivered = true;
  historicalChat
    .sort((a, b) => a.created_at - b.created_at)
    .forEach(event => chatCb(parseChatMessage(event), true));
  if (chatEoseCb) chatEoseCb();
}

function deliverHistoricalRaids() {
  if (raidHistoryDelivered || !raidCb) return;
  raidHistoryDelivered = true;
  historicalRaids
    .sort((a, b) => a.created_at - b.created_at)
    .forEach(event => raidCb({ pubkey: event.pubkey, content: event.content, timestamp: event.created_at }, true));
  if (raidEoseCb) raidEoseCb();
}

export function initNostr(naddr, configRelays, myPubkey = null) {
  if (window.__nostrPool) window.__nostrPool.close(window.__nostrRelays || []);

  // Reset mux state
  muxEosed = false;
  zapHistoryDelivered = false;
  chatHistoryDelivered = false;
  raidHistoryDelivered = false;
  streamInfoCb = null;
  zapCb = null;
  zapEoseCb = null;
  chatCb = null;
  chatEoseCb = null;
  raidCb = null;
  raidEoseCb = null;
  pendingStreamInfo.length = 0;
  historicalZaps.length = 0;
  historicalChat.length = 0;
  historicalRaids.length = 0;

  profilePubkey = myPubkey;
  pool = new SimplePool();
  window.__nostrPool = pool;

  const decoded = nip19.decode(naddr);
  if (decoded.type === 'naddr') {
    streamPubkey = decoded.data.pubkey;
    streamIdentifier = decoded.data.identifier;
    relays = configRelays;
    window.__nostrRelays = relays;
    streamATag = `30311:${streamPubkey}:${streamIdentifier}`;
  } else {
    console.error('Invalid naddr');
    return null;
  }

  startMux();
  return { pool, streamPubkey, streamIdentifier, streamATag, relays };
}

export function subscribeStreamInfo(onUpdate) {
  streamInfoCb = onUpdate;
  pendingStreamInfo.forEach(info => onUpdate(info));
  pendingStreamInfo.length = 0;
}

export function subscribeZaps(onZap, onEose) {
  zapCb = onZap;
  zapEoseCb = onEose;
  if (muxEosed) deliverHistoricalZaps();
}

export function subscribeChat(onMessage, onEose) {
  chatCb = onMessage;
  chatEoseCb = onEose;
  if (muxEosed) deliverHistoricalChat();
}

export function subscribeNotifications(onNotification) {
  if (!pool) return;
  const MY_PUBKEY = '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185';
  const since = Math.floor(Date.now() / 1000);
  const requests = [
    ...relays.map(url => ({ url, filter: { kinds: [1, 7, 9735, 3], '#p': [MY_PUBKEY], since } })),
    ...relays.map(url => ({ url, filter: { kinds: [1, 7, 3, 9734], authors: [MY_PUBKEY], since } })),
  ];
  pool.subscribeMap(requests, {
    onevent(event) {
      const isOwn = event.pubkey === MY_PUBKEY;
      if (event.kind === 9735) {
        if (isOwn) return;
        const descTag = event.tags.find(t => t[0] === 'description');
        let pubkey = event.pubkey;
        if (descTag) { try { pubkey = JSON.parse(descTag[1]).pubkey || pubkey; } catch {} }
        onNotification({ type: 'zap', pubkey, id: event.id, own: false });
      } else if (event.kind === 9734 && isOwn) {
        const amountTag = event.tags.find(t => t[0] === 'amount');
        const sats = amountTag ? Math.floor(parseInt(amountTag[1], 10) / 1000) : 0;
        onNotification({ type: 'zap', pubkey: MY_PUBKEY, id: event.id, own: true, amount: sats });
      } else if (event.kind === 1) {
        const isReply = event.tags.some(t => t[0] === 'e');
        const type = isOwn && !isReply ? 'post' : isReply ? 'reply' : 'comment';
        onNotification({ type, pubkey: event.pubkey, id: event.id, own: isOwn });
      } else if (event.kind === 7) {
        const targetPubkey = isOwn ? (event.tags.filter(t => t[0] === 'p').pop()?.[1] || null) : null;
        onNotification({ type: 'reaction', pubkey: event.pubkey, id: event.id, own: isOwn, targetPubkey });
      } else if (event.kind === 3) {
        onNotification({ type: 'follow', pubkey: event.pubkey, id: event.id, own: isOwn });
      }
    },
  });
}

function parseStreamEvent(event) {
  const tags = Object.fromEntries(
    event.tags
      .filter((t) => ['title', 'summary', 'image', 'status', 'streaming', 'current_participants', 'starts'].includes(t[0]))
      .map((t) => [t[0], t[1]])
  );
  return {
    title: tags.title || 'NoGood Radio',
    summary: tags.summary || '',
    image: tags.image || '',
    status: tags.status || 'unknown',
    streaming: tags.streaming || '',
    viewers: tags.current_participants ? parseInt(tags.current_participants, 10) : null,
    starts: tags.starts ? parseInt(tags.starts, 10) : null,
    pubkey: event.pubkey,
    event,
  };
}

function parseZapReceipt(event) {
  const descriptionTag = event.tags.find((t) => t[0] === 'description');
  if (!descriptionTag) return null;

  let zapRequest;
  try {
    zapRequest = JSON.parse(descriptionTag[1]);
  } catch {
    return null;
  }

  const bolt11Tag = event.tags.find((t) => t[0] === 'bolt11');
  const amount = bolt11Tag ? decodeBolt11Amount(bolt11Tag[1]) : 0;

  return {
    id: event.id,
    amount,
    senderPubkey: zapRequest.pubkey || null,
    timestamp: event.created_at,
    content: zapRequest.content || '',
  };
}

function decodeBolt11Amount(bolt11) {
  const match = bolt11.match(/^lnbc(\d+)([munp]?)/i);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 'm': return num * 100000;
    case 'u': return num * 100;
    case 'n': return Math.floor(num / 10);
    case 'p': return Math.floor(num / 10000);
    default: return num * 100000000;
  }
}

function parseChatMessage(event) {
  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    timestamp: event.created_at,
    tags: event.tags,
  };
}

export async function sendChatMessage(content) {
  if (!window.nostr) throw new Error('NIP-07 extension not found');
  if (!pool) throw new Error('Not connected');

  const event = {
    kind: 1311,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['a', streamATag, '', 'root']],
    content,
  };

  const signed = await window.nostr.signEvent(event);
  await Promise.any(pool.publish(relays, signed));
  return signed;
}

const profileFetchQueue = new Map(); // pubkey -> resolve[]
let profileFetchTimer = null;

async function flushProfileQueue() {
  profileFetchTimer = null;
  const pubkeys = [...profileFetchQueue.keys()];
  const waiting = new Map(profileFetchQueue);
  profileFetchQueue.clear();

  const fallback = { name: 'anon', lud16: null, picture: null };

  let events = [];
  try {
    events = await pool.querySync(relays, { kinds: [0], authors: pubkeys });
  } catch {
    for (const resolves of waiting.values()) resolves.forEach(r => r(fallback));
    return;
  }

  const byPubkey = new Map();
  for (const event of events) {
    if (!byPubkey.has(event.pubkey)) byPubkey.set(event.pubkey, event);
  }

  for (const pubkey of pubkeys) {
    const event = byPubkey.get(pubkey);
    let result;
    if (event) {
      try {
        const p = JSON.parse(event.content);
        result = {
          name: p.display_name || p.name || truncateNpub(pubkey),
          lud16: p.lud16 || null,
          picture: p.picture || null,
        };
      } catch {
        result = fallback;
      }
    } else {
      result = fallback;
    }
    PROFILE_CACHE.set(pubkey, result);
    for (const resolve of (waiting.get(pubkey) || [])) resolve(result);
  }
}

export function fetchProfile(pubkey) {
  if (!pubkey) return Promise.resolve({ name: 'anon', lud16: null, picture: null });
  if (PROFILE_CACHE.has(pubkey)) return Promise.resolve(PROFILE_CACHE.get(pubkey));

  return new Promise(resolve => {
    if (!profileFetchQueue.has(pubkey)) profileFetchQueue.set(pubkey, []);
    profileFetchQueue.get(pubkey).push(resolve);
    if (!profileFetchTimer) profileFetchTimer = setTimeout(flushProfileQueue, 50);
  });
}

function truncateNpub(pubkey) {
  try {
    const npub = nip19.npubEncode(pubkey);
    return npub.slice(0, 8) + '...' + npub.slice(-4);
  } catch {
    return pubkey.slice(0, 8);
  }
}

export function subscribeRaids(onRaid, onEose) {
  raidCb = onRaid;
  raidEoseCb = onEose;
  if (muxEosed) deliverHistoricalRaids();
}

export function getStreamATag() { return streamATag; }
export function getStreamPubkey() { return streamPubkey; }
export function getRelays() { return relays; }
export function getPool() { return pool; }
