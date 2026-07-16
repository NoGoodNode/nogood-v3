import { initStream } from './stream.js';
import { initNostr, subscribeStreamInfo, subscribeZaps, subscribeChat, sendChatMessage, fetchProfile } from './nostr.js';
import { initZapButtons, configureZap } from './zap.js';
import { initLastFm } from './lastfm.js';
import * as nip19 from '/assets/js/vendor/nostr-nip19.js';

const CONFIG = {
  hlsUrl: 'https://api-core.zap.stream/537a365c-f1ec-44ac-af10-22d14a7319fb/hls/live.m3u8',
  naddr: 'naddr1qqjr2vehvyenvdtr94nrzetr956rgctr94skvvfs95eryep3x3snwve389nxyqgwwaehxw309ahx7uewd3hkctczyr85tf46zd366lkjzws83ecs6fq3ttnjrjd500g7haz936h0knp22qcyqqq8vecjrlda8',
  fallbackImage: 'https://blossom.nogood.studio/6d5bb489e87c2f2db2a0fa61fd2bfca9f6d4f50e05b7caf1784644886c0e4ff6.jpg',
  relays: ['wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.damus.io'],
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
const seenMessages = new Set();
const seenZaps = new Set();
const lastMessageTime = new Map();
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

function renderContentWithMentions(el, text, emojiMap = {}) {
  const tokenPattern = /(https?:\/\/[^\s]+)|(?:nostr:|@)(npub1[a-z0-9]+|nprofile1[a-z0-9]+)|:([a-zA-Z0-9_]+):/g;
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      el.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1]) {
      const span = document.createElement('span');
      span.className = 'chat__message-link';
      span.textContent = match[1].length > 30 ? match[1].slice(0, 30) + '…' : match[1];
      el.appendChild(span);
    } else if (match[2]) {
      try {
        const decoded = nip19.decode(match[2]);
        const pk = decoded.type === 'npub' ? decoded.data : decoded.data?.pubkey;
        const a = document.createElement('a');
        a.href = `https://njump.me/${match[2]}`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'nostr-mention';
        if (pk) {
          fetchProfile(pk).then(profile => {
            a.textContent = `@${profile?.display_name || profile?.name || match[2].slice(0, 12) + '…'}`;
          });
        } else {
          a.textContent = `@${match[2].slice(0, 12)}…`;
        }
        el.appendChild(a);
      } catch {
        el.appendChild(document.createTextNode(match[0]));
      }
    } else if (match[3] && emojiMap[match[3]]) {
      const img = document.createElement('img');
      img.src = emojiMap[match[3]];
      img.alt = `:${match[3]}:`;
      img.className = 'chat__emoji';
      el.appendChild(img);
    } else {
      el.appendChild(document.createTextNode(match[0]));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    el.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function appendChatMessage(msg) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;

  const now = msg.timestamp * 1000;
  const last = lastMessageTime.get(msg.pubkey) || 0;
  if (now - last < CHAT_RATE_LIMIT_MS) return;
  lastMessageTime.set(msg.pubkey, now);

  const el = document.createElement('div');
  el.className = 'chat__message';

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
  renderContentWithMentions(text, msg.content, emojiMap);

  el.appendChild(sender);
  el.appendChild(text);
  insertInOrder(el, msg.timestamp, messagesEl);
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

  subscribeChat((msg, isHistorical) => {
    if (seenMessages.has(msg.id)) return;
    seenMessages.add(msg.id);

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
