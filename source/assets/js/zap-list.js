import { initNostr, subscribeZaps, fetchProfile } from './radio/nostr.js';

const CONFIG = {
  naddr: 'naddr1qqjr2vehvyenvdtr94nrzetr956rgctr94skvvfs95eryep3x3snwve389nxyqgwwaehxw309ahx7uewd3hkctczyr85tf46zd366lkjzws83ecs6fq3ttnjrjd500g7haz936h0knp22qcyqqq8vecjrlda8',
  relays: ['wss://relay.zap.stream', 'wss://nos.lol', 'wss://relay.damus.io'],
};

const MAX_ZAPS = 10;
const container = document.getElementById('zap-list');
if (!container) throw new Error('No #zap-list element');

const seenZaps = new Set();
const historicalZaps = [];

initNostr(CONFIG.naddr, CONFIG.relays);

subscribeZaps((zap, isHistorical) => {
  if (seenZaps.has(zap.id)) return;
  seenZaps.add(zap.id);

  if (isHistorical) {
    historicalZaps.push(zap);
  } else {
    container.prepend(createZapEl(zap));
    while (container.children.length > MAX_ZAPS) {
      container.lastElementChild.remove();
    }
  }
}, () => {
  historicalZaps
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ZAPS)
    .forEach(zap => container.appendChild(createZapEl(zap)));
});

function createZapEl(zap) {
  const el = document.createElement('div');
  el.className = 'chat__message chat__message--zap';

  const amountEl = document.createElement('span');
  amountEl.className = 'chat__message-zap-amount pixel-font';
  amountEl.textContent = `⚡ ${formatSats(zap.amount)} sats`;
  el.appendChild(amountEl);

  if (zap.senderPubkey) {
    const sender = document.createElement('span');
    sender.className = 'chat__message-sender';
    sender.textContent = zap.senderPubkey.slice(0, 8);
    fetchProfile(zap.senderPubkey).then(profile => {
      sender.textContent = profile.name;
    });
    el.appendChild(sender);
  }

  if (zap.content) {
    const text = document.createElement('span');
    text.className = 'chat__message-text';
    text.textContent = zap.content;
    el.appendChild(text);
  }

  return el;
}

function formatSats(amount) {
  if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'k';
  return amount.toString();
}
