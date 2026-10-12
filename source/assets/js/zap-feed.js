import { getEventHub } from '/assets/js/nostr/event-hub.js';
import { NOGOOD_PUBKEY, NOGOOD_ZAP_RELAYS } from '/assets/js/nostr/config.js';
import { parseZapReceipt } from '/assets/js/nostr/zaps.js';
import * as nip19 from '/assets/js/vendor/nostr-nip19.js';

const PUBKEY = NOGOOD_PUBKEY;
const STREAM_ADDRESS = '30311:cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5:537a365c-f1ec-44ac-af10-22d14a7319fb';
const RELAYS = NOGOOD_ZAP_RELAYS;
const MAX_ZAPS = 5;
const MAX_LEADERBOARD = 5;
const hub = getEventHub();

function truncateNpub(pubkey) {
  try {
    const npub = nip19.npubEncode(pubkey);
    return npub.slice(0, 8) + '...' + npub.slice(-4);
  } catch {
    return pubkey.slice(0, 8);
  }
}

function formatSats(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  return n.toString();
}

function renderZap(container, zap, name) {
  const el = document.createElement('div');
  el.className = 'chat__message chat__message--zap';

  const amountEl = document.createElement('span');
  amountEl.className = 'chat__message-zap-amount pixel-font';
  amountEl.textContent = `⚡ ${formatSats(zap.amount)} sats`;

  const senderEl = document.createElement('span');
  senderEl.className = 'chat__message-sender';
  senderEl.textContent = name;

  el.appendChild(senderEl);
  el.appendChild(amountEl);
  container.appendChild(el);
}

async function initFeed({ container, filter, expectedATag = null, leaderboardContainer = null }) {
  const events = await hub.query(filter, { relays: RELAYS, maxWait: 1500 });

  const allParsed = events
    .filter(event => !expectedATag || event.tags.some(tag => tag[0] === 'a' && tag[1] === expectedATag))
    .map(event => parseZapReceipt(event, { expectedATag }))
    .filter(zap => zap && zap.senderPubkey !== PUBKEY);

  const recentZaps = allParsed
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ZAPS);

  const totals = new Map();
  allParsed.forEach(zap => {
    if (!zap.senderPubkey) return;
    totals.set(zap.senderPubkey, (totals.get(zap.senderPubkey) || 0) + zap.amount);
  });

  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LEADERBOARD);

  const allPubkeys = [...new Set([
    ...recentZaps.map(zap => zap.senderPubkey),
    ...top.map(([pubkey]) => pubkey),
  ].filter(Boolean))];

  const profileMap = new Map();
  if (allPubkeys.length) {
    const profileEvents = await hub.query(
      { kinds: [0], authors: allPubkeys },
      { relays: RELAYS, maxWait: 1500 }
    );

    profileEvents.forEach(event => {
      if (profileMap.has(event.pubkey)) return;
      try {
        const profile = JSON.parse(event.content);
        profileMap.set(event.pubkey, profile.display_name || profile.name || truncateNpub(event.pubkey));
      } catch {
        profileMap.set(event.pubkey, 'anon');
      }
    });
  }

  const getName = pubkey => profileMap.get(pubkey) || truncateNpub(pubkey);

  recentZaps.forEach(zap => {
    renderZap(container, zap, zap.senderPubkey ? getName(zap.senderPubkey) : 'anon');
  });

  if (leaderboardContainer) {
    top.forEach(([pubkey, total], index) => {
      const el = document.createElement('div');
      el.className = 'chat__message chat__message--zap';

      const rankEl = document.createElement('span');
      rankEl.className = 'chat__message-sender';
      rankEl.textContent = `${index + 1}. ${getName(pubkey)}`;

      const amountEl = document.createElement('span');
      amountEl.className = 'chat__message-zap-amount pixel-font';
      amountEl.textContent = `⚡ ${formatSats(total)} sats`;

      el.appendChild(rankEl);
      el.appendChild(amountEl);
      leaderboardContainer.appendChild(el);
    });
  }
}

const feeds = [
  {
    container: document.getElementById('home-zap-feed'),
    leaderboardContainer: document.getElementById('home-zap-leaderboard'),
    filter: { kinds: [9735], '#p': [PUBKEY], limit: 100 },
  },
  {
    container: document.getElementById('home-radio-zap-feed'),
    filter: { kinds: [9735], '#a': [STREAM_ADDRESS], limit: 100 },
    expectedATag: STREAM_ADDRESS,
  },
  {
    container: document.getElementById('radio-zap-feed'),
    leaderboardContainer: document.getElementById('radio-zap-leaderboard'),
    filter: { kinds: [9735], '#a': [STREAM_ADDRESS], limit: 100 },
    expectedATag: STREAM_ADDRESS,
  },
].filter(feed => feed.container);

Promise.all(feeds.map(initFeed)).catch(error => {
  console.error('[zap-feed]', error);
});
