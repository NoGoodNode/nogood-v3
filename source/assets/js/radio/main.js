import { initStream } from './stream.js';
import { initNostr, subscribeStreamInfo, subscribeZaps, subscribeChat, subscribeRaids, sendChatMessage, fetchProfile } from './nostr.js';
import { initZapButtons, configureZap } from './zap.js';
import { initLastFm } from './lastfm.js';
import { NOGOOD_NOSTR_RELAYS } from '/assets/js/nostr/config.js';
import { createChatSpamFilter } from '/assets/js/nostr/chat-moderation.js';
import { renderChatContent } from '/assets/js/nostr/chat-content.js';
import { createChatFeed } from '/assets/js/nostr/chat-feed.js';

const BOT_PUBKEY = 'c0434367d3e598555e930db7d54eb5e2b4013c0b7673c8f668475fc76b6a6606';

const CONFIG = {
  hlsUrl: 'https://api-core.zap.stream/537a365c-f1ec-44ac-af10-22d14a7319fb/hls/live.m3u8',
  naddr: 'naddr1qqjr2vehvyenvdtr94nrzetr956rgctr94skvvfs95eryep3x3snwve389nxyqgwwaehxw309ahx7uewd3hkctczyr85tf46zd366lkjzws83ecs6fq3ttnjrjd500g7haz936h0knp22qcyqqq8vecjrlda8',
  fallbackImage: 'https://blossom.nogood.studio/6d5bb489e87c2f2db2a0fa61fd2bfca9f6d4f50e05b7caf1784644886c0e4ff6.jpg',
  relays: NOGOOD_NOSTR_RELAYS,
};

function waitForGlobal(name, timeout = 3000) {
  return new Promise((resolve) => {
    if (window[name]) return resolve(window[name]);
    const interval = setInterval(() => {
      if (window[name]) {
        clearInterval(interval);
        resolve(window[name]);
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      resolve(null);
    }, timeout);
  });
}

const MAX_CHAT_DOM = 200;
const CHAT_RATE_LIMIT_MS = 15000;
const CHAT_SEND_COOLDOWN_MS = 10000;
const seenZaps = new Set();
const lastMessageTime = new Map();
const shouldHideChatMessage = createChatSpamFilter();
let autoScroll = true;
const historicalZapsForChat = [];
const historicalChatMsgs = [];
let zapHistoricalDone = false;
let chatHistoricalDone = false;
let historicalRendered = false;

// Match chat height to player
const playerEl = document.querySelector('.player');
const chatEl = document.querySelector('.chat');
if (playerEl && chatEl) {
  new ResizeObserver(([entry]) => {
    chatEl.style.height = entry.borderBoxSize[0].blockSize + 'px';
  }).observe(playerEl);
}

// Stream
initStream(CONFIG.hlsUrl, CONFIG.fallbackImage);

// Nostr
const nostrCtx = initNostr(CONFIG.naddr, CONFIG.relays);

if (nostrCtx) {
  subscribeStreamInfo((info) => {
    const descEl = document.getElementById('stream-description');
    const viewersEl = document.getElementById('stream-viewers');
    const uptimeEl = document.getElementById('stream-uptime');
    if (descEl) descEl.textContent = info.summary;
    if (viewersEl) {
      if (info.viewers !== null && info.viewers > 0) {
        viewersEl.textContent = `${info.viewers} listening`;
        viewersEl.style.display = 'inline';
      } else {
        viewersEl.style.display = 'none';
      }
    }
    if (uptimeEl && info.starts) {
      const updateUptime = () => {
        const secs = Math.floor(Date.now() / 1000) - info.starts;
        if (secs < 0) { uptimeEl.style.display = 'none'; return; }
        const months = Math.floor(secs / (30 * 24 * 3600));
        const days = Math.floor(secs / 86400);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        let label;
        if (months >= 1) label = `uptime ${months} month${months > 1 ? 's' : ''}`;
        else if (days >= 1) label = `uptime ${days} day${days > 1 ? 's' : ''}`;
        else if (h >= 1) label = `uptime ${h}h ${String(m).padStart(2, '0')}m`;
        else label = `uptime ${m}m ${String(s).padStart(2, '0')}s`;
        uptimeEl.textContent = label;
        uptimeEl.style.display = 'inline';
      };
      updateUptime();
      if (!uptimeEl._interval) uptimeEl._interval = setInterval(updateUptime, 1000);
    }
  });

  initTicker();
  initSupporters();
  initChat();
}

// Last.fm tracklist
initLastFm();

// Zap
configureZap('nogood@getalby.com');
initZapButtons();

// Ticker

function initTicker() {
  const track = document.getElementById('ticker-track');

  subscribeZaps((zap, isHistorical) => {
    if (seenZaps.has(zap.id)) return;
    seenZaps.add(zap.id);
    const isOwn = zap.senderPubkey === '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185';

    if (!isOwn) {

      const item = document.createElement('li');
      item.className = 'ticker__item pixel-font uppercase text-small';
      item.dataset.zapId = zap.id;

      const senderEl = document.createElement('span');
      senderEl.className = 'ticker__sender';

      const amountEl = document.createElement('span');
      amountEl.className = 'ticker__amount';
      amountEl.textContent = `⚡ ${formatSats(zap.amount)} sats`;

      item.appendChild(senderEl);
      item.appendChild(amountEl);

      if (zap.content) {
        const msgEl = document.createElement('span');
        msgEl.className = 'ticker__message';
        msgEl.textContent = zap.content;
        item.appendChild(msgEl);
      }

      const senderKey = zap.senderPubkey;
      const insertItem = (name) => {
        senderEl.textContent = name;
        track.prepend(item);
        while (track.children.length > 10) track.lastElementChild.remove();
        updateTickerDuplicate();
      };

      if (senderKey) {
        fetchProfile(senderKey).then(p => insertItem(p.name)).catch(() => insertItem(senderKey.slice(0, 8)));
      } else {
        insertItem('anon');
      }
    }

    if (isHistorical) {
      historicalZapsForChat.push(zap);
    } else {
      appendZapToChat(zap);
    }
  }, () => {
    zapHistoricalDone = true;
    if (historicalRendered) historicalZapsForChat.forEach(z => appendZapToChat(z));
    else maybeRenderHistorical();
  });
}

function initSupporters() {
  const feed = document.getElementById('radio-zap-feed');
  const leaderboard = document.getElementById('radio-zap-leaderboard');
  const zaps = new Map();
  let ready = false;

  function row(label, amount) {
    const el = document.createElement('div');
    el.className = 'chat__message chat__message--zap';

    const sender = document.createElement('span');
    sender.className = 'chat__message-sender';
    sender.textContent = label;

    const value = document.createElement('span');
    value.className = 'chat__message-zap-amount pixel-font';
    value.textContent = `⚡ ${formatSats(amount)} sats`;

    el.append(sender, value);
    return el;
  }

  async function render() {
    if (!ready) return;
    const all = [...zaps.values()];
    const recent = all.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    const totals = new Map();
    all.forEach(zap => {
      if (zap.senderPubkey) totals.set(zap.senderPubkey, (totals.get(zap.senderPubkey) || 0) + zap.amount);
    });
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const pubkeys = [...new Set([...recent.map(zap => zap.senderPubkey), ...top.map(([pubkey]) => pubkey)].filter(Boolean))];
    const profiles = new Map(await Promise.all(pubkeys.map(async pubkey => [pubkey, await fetchProfile(pubkey)])));
    const name = pubkey => profiles.get(pubkey)?.name || pubkey?.slice(0, 8) || 'anon';

    feed.replaceChildren(...recent.map(zap => row(name(zap.senderPubkey), zap.amount)));
    leaderboard.replaceChildren(...top.map(([pubkey, amount], index) => row(`${index + 1}. ${name(pubkey)}`, amount)));
  }

  subscribeZaps((zap) => {
    if (zap.isStreamZap && zap.senderPubkey !== '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185') {
      zaps.set(zap.id, zap);
      render();
    }
  }, () => {
    ready = true;
    render();
  });
}

function insertInOrder(el, timestamp, messagesEl) {
  el.dataset.ts = timestamp;
  const children = messagesEl.children;
  let refNode = null;
  for (let i = 0; i < children.length; i++) {
    const ts = parseInt(children[i].dataset.ts, 10);
    if (!isNaN(ts) && ts > timestamp) { refNode = children[i]; break; }
  }
  if (refNode) messagesEl.insertBefore(el, refNode);
  else messagesEl.appendChild(el);
  while (messagesEl.children.length > MAX_CHAT_DOM) messagesEl.firstElementChild.remove();
  if (!refNode && autoScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendZapToChat(zap) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;

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
    fetchProfile(zap.senderPubkey).then((profile) => { sender.textContent = profile.name; });
    el.appendChild(sender);
  }

  if (zap.content) {
    const text = document.createElement('span');
    text.className = 'chat__message-text';
    text.textContent = zap.content;
    el.appendChild(text);
  }

  insertInOrder(el, zap.timestamp, messagesEl);
}

function appendRaidToChat(raid) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;

  const el = document.createElement('div');
  el.className = 'chat__message chat__message--raid';

  const sender = document.createElement('span');
  sender.className = 'chat__message-sender';
  sender.textContent = 'RAID';
  el.appendChild(sender);

  const text = document.createElement('span');
  text.className = 'chat__message-text';
  el.appendChild(text);

  insertInOrder(el, raid.timestamp, messagesEl);

  fetchProfile(raid.pubkey)
    .then(p => { sender.textContent = `RAID FROM ${p.name || raid.pubkey.slice(0, 8)}`; })
    .catch(() => { sender.textContent = `RAID FROM ${raid.pubkey.slice(0, 8)}`; });
}

function renderChatMessage(msg) {
  const el = document.createElement('div');
  el.className = msg.pubkey === BOT_PUBKEY ? 'chat__message chat__message--bot' : 'chat__message';

  const sender = document.createElement('span');
  sender.className = 'chat__message-sender';
  sender.textContent = msg.pubkey.slice(0, 8);
  fetchProfile(msg.pubkey).then((profile) => {
    sender.textContent = profile.name;
  });

  const emojiMap = {};
  if (msg.tags) {
    for (const tag of msg.tags) {
      if (tag[0] === 'emoji' && tag[1] && tag[2]) emojiMap[tag[1]] = tag[2];
    }
  }

  const text = document.createElement('span');
  text.className = 'chat__message-text';
  renderChatContent(text, msg.content, {
    emojiMap,
    fetchProfile,
    linkClass: 'chat__message-link',
    mentionClass: 'nostr-mention',
    emojiClass: 'chat__emoji',
    mentionLink: true,
    profileName: profile => profile?.display_name || profile?.name,
  });

  el.appendChild(sender);
  el.appendChild(text);
  return el;
}

const chatFeed = createChatFeed({
  getContainer: () => document.getElementById('chat-messages'),
  shouldHideMessage: shouldHideChatMessage,
  maxMessages: MAX_CHAT_DOM,
  renderMessage: renderChatMessage,
  canRenderMessage(msg) {
    if (msg.pubkey === BOT_PUBKEY) return true;
    const now = msg.timestamp * 1000;
    const last = lastMessageTime.get(msg.pubkey) || 0;
    if (now - last < CHAT_RATE_LIMIT_MS) return false;
    lastMessageTime.set(msg.pubkey, now);
    return true;
  },
});

function appendChatMessage(msg) {
  chatFeed.append(msg);
}

function maybeRenderHistorical() {
  if (!chatHistoricalDone || historicalRendered) return;
  historicalRendered = true;

  const firstChatTimestamp = historicalChatMsgs.length > 0
    ? Math.min(...historicalChatMsgs.map(m => m.timestamp))
    : 0;

  const items = [
    ...historicalChatMsgs.map(msg => ({ type: 'chat', timestamp: msg.timestamp, data: msg })),
    ...historicalZapsForChat
      .filter(zap => zap.timestamp >= firstChatTimestamp)
      .map(zap => ({ type: 'zap', timestamp: zap.timestamp, data: zap })),
  ];
  items.sort((a, b) => a.timestamp - b.timestamp);
  items.forEach(item => {
    if (item.type === 'chat') appendChatMessage(item.data);
    else appendZapToChat(item.data);
  });

  historicalZapsForChat.length = 0;

  const messagesEl = document.getElementById('chat-messages');
  if (messagesEl && autoScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateTickerDuplicate() {
  const track = document.getElementById('ticker-track');
  const dup = document.getElementById('ticker-track-dup');
  if (!dup) return;

  dup.innerHTML = '';
  track.querySelectorAll('.ticker__item').forEach((item) => {
    dup.appendChild(item.cloneNode(true));
  });
}

function formatSats(amount) {
  if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'k';
  return amount.toString();
}

// Chat

async function initChat() {
  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const sendEl = document.getElementById('chat-send');
  const noticeEl = document.getElementById('chat-notice');
  const inputArea = document.getElementById('chat-input-area');

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    inputArea.classList.add('chat__input-area--mobile-hidden');
    noticeEl.textContent = 'Chat posting available on desktop';
    noticeEl.hidden = false;
  } else {
    const nostr = await waitForGlobal('nostr');
    if (nostr) {
      inputEl.disabled = false;
      inputEl.placeholder = 'Type a message...';
      sendEl.disabled = false;
    } else {
      inputEl.placeholder = 'Requires a Nostr extension to chat';
      noticeEl.textContent = 'Install a NIP-07 extension (e.g. Alby, nos2x) to join chat';
      noticeEl.hidden = false;
    }
  }

  messagesEl.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = messagesEl;
    autoScroll = scrollHeight - scrollTop - clientHeight < 40;
  });

  subscribeRaids((raid) => {
    appendRaidToChat(raid);
  });

  subscribeChat((msg, isHistorical) => {
    if (isHistorical) {
      historicalChatMsgs.push(msg);
      return;
    }

    appendChatMessage(msg);
  }, () => {
    chatHistoricalDone = true;
    maybeRenderHistorical();
  });

  async function handleSend() {
    const content = inputEl.value.trim();
    if (!content) return;

    sendEl.disabled = true;
    inputEl.disabled = true;

    try {
      await sendChatMessage(content);
      inputEl.value = '';
      setTimeout(() => {
        inputEl.disabled = false;
        sendEl.disabled = false;
        inputEl.focus();
      }, CHAT_SEND_COOLDOWN_MS);
    } catch (err) {
      console.error('Failed to send:', err);
      inputEl.disabled = false;
      sendEl.disabled = false;
    }
  }

  sendEl.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}
