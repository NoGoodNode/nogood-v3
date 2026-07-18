import { SimplePool } from '/assets/js/vendor/nostr-pool.js';
import * as nip19 from '/assets/js/vendor/nostr-nip19.js';

const PUBKEY = '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185';
const STREAM_ADDRESS = '30311:cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5:537a365c-f1ec-44ac-af10-22d14a7319fb';
const RELAYS = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.getalby.com/v1',
  'wss://relay.nogood.tech',
];
const MAX_ZAPS = 5;
const MAX_LEADERBOARD = 5;

const isRadio = !!document.getElementById('radio-zap-feed');
const container = isRadio ? document.getElementById('radio-zap-feed') : document.getElementById('home-zap-feed');
const leaderboardContainer = isRadio ? document.getElementById('radio-zap-leaderboard') : document.getElementById('home-zap-leaderboard');
if (!container) throw new Error('No zap feed element found');

const filter = isRadio
  ? { kinds: [9735], '#a': [STREAM_ADDRESS], limit: 100 }
  : { kinds: [9735], '#p': [PUBKEY], limit: 100 };

const pool = new SimplePool();

function truncateNpub(pubkey) {
  try {
    const npub = nip19.npubEncode(pubkey);
    return npub.slice(0, 8) + '...' + npub.slice(-4);
  } catch { return pubkey.slice(0, 8); }
}

function parseZap(event) {
  const descTag = event.tags.find(t => t[0] === 'description');
  if (!descTag) return null;
  let zapRequest;
  try { zapRequest = JSON.parse(descTag[1]); } catch { return null; }
  const bolt11 = event.tags.find(t => t[0] === 'bolt11');
  return {
    id: event.id,
    amount: bolt11 ? decodeBolt11Amount(bolt11[1]) : 0,
    senderPubkey: zapRequest.pubkey || null,
    timestamp: event.created_at,
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
    default:  return num * 100000000;
  }
}

function formatSats(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  return n.toString();
}

function renderZap(zap, name) {
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

async function init() {
  // Single query for all zap events — cap wait so slow relays don't stall render
  const events = await pool.querySync(RELAYS, filter, { maxWait: 1500 });

  const allParsed = events
    .filter(e => !isRadio || e.tags.some(t => t[0] === 'a' && t[1] === STREAM_ADDRESS))
    .map(parseZap)
    .filter(zap => zap && zap.senderPubkey !== PUBKEY);

  const recentZaps = allParsed
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ZAPS);

  // Leaderboard aggregation
  const totals = new Map();
  allParsed.forEach(zap => {
    if (!zap.senderPubkey) return;
    totals.set(zap.senderPubkey, (totals.get(zap.senderPubkey) || 0) + zap.amount);
  });
  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LEADERBOARD);

  // Collect all unique pubkeys and fetch profiles in one query
  const allPubkeys = [...new Set([
    ...recentZaps.map(z => z.senderPubkey),
    ...top.map(([pk]) => pk),
  ].filter(Boolean))];

  const profileMap = new Map();
  if (allPubkeys.length) {
    const profileEvents = await pool.querySync(RELAYS, { kinds: [0], authors: allPubkeys }, { maxWait: 1500 });
    profileEvents.forEach(e => {
      if (profileMap.has(e.pubkey)) return;
      try {
        const p = JSON.parse(e.content);
        profileMap.set(e.pubkey, p.display_name || p.name || truncateNpub(e.pubkey));
      } catch { profileMap.set(e.pubkey, 'anon'); }
    });
  }

  const getName = pk => profileMap.get(pk) || truncateNpub(pk);

  recentZaps.forEach(zap => renderZap(zap, zap.senderPubkey ? getName(zap.senderPubkey) : 'anon'));

  if (leaderboardContainer) {
    top.forEach(([pk, total], i) => {
      const el = document.createElement('div');
      el.className = 'chat__message chat__message--zap';

      const rankEl = document.createElement('span');
      rankEl.className = 'chat__message-sender';
      rankEl.textContent = `${i + 1}. ${getName(pk)}`;

      const amountEl = document.createElement('span');
      amountEl.className = 'chat__message-zap-amount pixel-font';
      amountEl.textContent = `⚡ ${formatSats(total)} sats`;

      el.appendChild(rankEl);
      el.appendChild(amountEl);
      leaderboardContainer.appendChild(el);
    });
  }

  pool.close(RELAYS);
}

init();
