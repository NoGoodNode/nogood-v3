import { getEventHub } from '/assets/js/nostr/event-hub.js';
import { NOGOOD_PUBKEY } from '/assets/js/nostr/config.js';
import { parseZapReceipt } from '/assets/js/nostr/zaps.js';
import * as nip19 from '/assets/js/vendor/nostr-nip19.js';

const PROFILE_CACHE = new Map();
const profileFetchQueue = new Map();
let profileFetchTimer = null;
let activeRadioNostr = null;

export function createRadioNostr({ naddr, relays, profilePubkey = null, hub = getEventHub(), decodeNaddr = nip19.decode }) {
  const decoded = decodeNaddr(naddr);
  if (decoded.type !== 'naddr') throw new Error('Invalid naddr');

  const streamPubkey = decoded.data.pubkey;
  const streamIdentifier = decoded.data.identifier;
  const streamATag = `30311:${streamPubkey}:${streamIdentifier}`;
  const events = { stream: [], zaps: [], chat: [], raids: [] };
  const subscribers = { stream: new Set(), zaps: new Set(), chat: new Set(), raids: new Set() };
  let ready = false;

  function notify(type, value, isHistorical) {
    events[type].push(value);
    subscribers[type].forEach(({ onEvent }) => onEvent(value, isHistorical));
  }

  function complete() {
    if (ready) return;
    ready = true;
    ['zaps', 'chat', 'raids'].forEach(type => {
      subscribers[type].forEach(({ onReady }) => onReady?.());
    });
  }

  const feed = hub.createFeed({
    filters: [
      { kinds: [30311], authors: [streamPubkey], '#d': [streamIdentifier] },
      { kinds: [9735], '#a': [streamATag], limit: 200 },
      ...(profilePubkey ? [{ kinds: [9735], '#p': [profilePubkey], limit: 200 }] : []),
      { kinds: [1311], '#a': [streamATag], limit: 50 },
      { kinds: [1312], '#a': [streamATag], limit: 10 },
    ],
  });

  feed.subscribe({
    onEvent(event, isHistorical) {
      if (event.kind === 30311) {
        notify('stream', parseStreamEvent(event), isHistorical);
      } else if (event.kind === 9735) {
        const isStreamZap = event.tags.some(tag => tag[0] === 'a' && tag[1] === streamATag);
        const isProfileZap = profilePubkey && event.tags.some(tag => tag[0] === 'p' && tag[1] === profilePubkey);
        if (!isStreamZap && !isProfileZap) return;
        const zap = parseZapReceipt(event, { expectedATag: isStreamZap ? streamATag : null });
        if (zap) notify('zaps', { ...zap, isStreamZap }, isHistorical);
      } else if (event.kind === 1311) {
        notify('chat', parseChatMessage(event), isHistorical);
      } else if (event.kind === 1312) {
        notify('raids', { id: event.id, pubkey: event.pubkey, content: event.content, timestamp: event.created_at }, isHistorical);
      }
    },
    onReady: complete,
  });

  function subscribe(type, onEvent, onReady) {
    events[type].forEach(event => onEvent(event, true));
    const subscriber = { onEvent, onReady };
    subscribers[type].add(subscriber);
    if (ready && onReady) onReady();
    return () => subscribers[type].delete(subscriber);
  }

  return {
    hub,
    relays,
    streamPubkey,
    streamIdentifier,
    streamATag,
    subscribeStreamInfo(onEvent) {
      return subscribe('stream', onEvent);
    },
    subscribeZaps(onEvent, onReady) {
      return subscribe('zaps', onEvent, onReady);
    },
    subscribeChat(onEvent, onReady) {
      return subscribe('chat', onEvent, onReady);
    },
    subscribeRaids(onEvent, onReady) {
      return subscribe('raids', onEvent, onReady);
    },
    close() {
      feed.close();
    },
  };
}

export function initNostr(naddr, relays, myPubkey = null) {
  activeRadioNostr?.close();
  try {
    activeRadioNostr = createRadioNostr({ naddr, relays, profilePubkey: myPubkey, hub: getEventHub() });
    return activeRadioNostr;
  } catch (error) {
    console.error(error.message);
    activeRadioNostr = null;
    return null;
  }
}

export function subscribeStreamInfo(onUpdate) {
  return activeRadioNostr?.subscribeStreamInfo(onUpdate);
}

export function subscribeZaps(onZap, onEose) {
  return activeRadioNostr?.subscribeZaps(onZap, onEose);
}

export function subscribeChat(onMessage, onEose) {
  return activeRadioNostr?.subscribeChat(onMessage, onEose);
}

export function subscribeRaids(onRaid, onEose) {
  return activeRadioNostr?.subscribeRaids(onRaid, onEose);
}

export function subscribeNotifications(onNotification) {
  if (!activeRadioNostr) return;
  const myPubkey = NOGOOD_PUBKEY;
  const since = Math.floor(Date.now() / 1000);
  activeRadioNostr.hub.createFeed({
    filters: [
      { kinds: [1, 7, 9735, 3], '#p': [myPubkey], since },
      { kinds: [1, 7, 3, 9734], authors: [myPubkey], since },
    ],
  }).subscribe({
    onEvent(event) {
      const isOwn = event.pubkey === myPubkey;
      if (event.kind === 9735) {
        if (isOwn) return;
        const description = event.tags.find(tag => tag[0] === 'description');
        let pubkey = event.pubkey;
        if (description) { try { pubkey = JSON.parse(description[1]).pubkey || pubkey; } catch {} }
        onNotification({ type: 'zap', pubkey, id: event.id, own: false });
      } else if (event.kind === 9734 && isOwn) {
        const amount = event.tags.find(tag => tag[0] === 'amount');
        onNotification({ type: 'zap', pubkey: myPubkey, id: event.id, own: true, amount: amount ? Math.floor(parseInt(amount[1], 10) / 1000) : 0 });
      } else if (event.kind === 1) {
        const isReply = event.tags.some(tag => tag[0] === 'e');
        onNotification({ type: isOwn && !isReply ? 'post' : isReply ? 'reply' : 'comment', pubkey: event.pubkey, id: event.id, own: isOwn });
      } else if (event.kind === 7) {
        const targetPubkey = isOwn ? event.tags.filter(tag => tag[0] === 'p').pop()?.[1] || null : null;
        onNotification({ type: 'reaction', pubkey: event.pubkey, id: event.id, own: isOwn, targetPubkey });
      } else if (event.kind === 3) {
        onNotification({ type: 'follow', pubkey: event.pubkey, id: event.id, own: isOwn });
      }
    },
  });
}

export async function sendChatMessage(content) {
  if (!window.nostr) throw new Error('NIP-07 extension not found');
  if (!activeRadioNostr) throw new Error('Not connected');
  const event = {
    kind: 1311,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['a', activeRadioNostr.streamATag, '', 'root']],
    content,
  };
  const signed = await window.nostr.signEvent(event);
  await Promise.any(activeRadioNostr.hub.pool.publish(activeRadioNostr.relays, signed));
  return signed;
}

async function flushProfileQueue() {
  profileFetchTimer = null;
  const pubkeys = [...profileFetchQueue.keys()];
  const waiting = new Map(profileFetchQueue);
  profileFetchQueue.clear();
  const fallback = { name: 'anon', lud16: null, picture: null };
  let events = [];
  try {
    events = await activeRadioNostr.hub.query({ kinds: [0], authors: pubkeys });
  } catch {
    for (const resolves of waiting.values()) resolves.forEach(resolve => resolve(fallback));
    return;
  }
  const byPubkey = new Map();
  events.forEach(event => {
    if (!byPubkey.has(event.pubkey)) byPubkey.set(event.pubkey, event);
  });
  pubkeys.forEach(pubkey => {
    const event = byPubkey.get(pubkey);
    let profile = fallback;
    if (event) {
      try {
        const parsed = JSON.parse(event.content);
        profile = { name: parsed.display_name || parsed.name || truncateNpub(pubkey), lud16: parsed.lud16 || null, picture: parsed.picture || null };
      } catch {}
    }
    PROFILE_CACHE.set(pubkey, profile);
    (waiting.get(pubkey) || []).forEach(resolve => resolve(profile));
  });
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

function parseStreamEvent(event) {
  const tags = Object.fromEntries(event.tags.filter(tag => ['title', 'summary', 'image', 'status', 'streaming', 'current_participants', 'starts'].includes(tag[0])).map(tag => [tag[0], tag[1]]));
  return { title: tags.title || 'NoGood Radio', summary: tags.summary || '', image: tags.image || '', status: tags.status || 'unknown', streaming: tags.streaming || '', viewers: tags.current_participants ? parseInt(tags.current_participants, 10) : null, starts: tags.starts ? parseInt(tags.starts, 10) : null, pubkey: event.pubkey, event };
}

function parseChatMessage(event) {
  return { id: event.id, pubkey: event.pubkey, content: event.content, timestamp: event.created_at, tags: event.tags };
}

function truncateNpub(pubkey) {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
  } catch {
    return pubkey.slice(0, 8);
  }
}

export function getStreamATag() { return activeRadioNostr?.streamATag || null; }
export function getRelays() { return activeRadioNostr?.relays || []; }
export function getPool() { return activeRadioNostr?.hub.pool || null; }
export function queryNostr(filters, options) { return activeRadioNostr ? activeRadioNostr.hub.query(filters, options) : Promise.resolve([]); }