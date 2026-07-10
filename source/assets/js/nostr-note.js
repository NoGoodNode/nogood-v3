import { SimplePool } from '/assets/js/vendor/nostr-pool.js';
import * as nip19 from '/assets/js/vendor/nostr-nip19.js';

const PUBKEY = '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185';
const RELAYS = [
  'wss://relay.primal.net',
  'wss://nos.lol',
];

const container = document.getElementById('latest-nostr-note');
if (!container) throw new Error('No #latest-nostr-note element');

const pool = new SimplePool();

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function noteUrl(eventId) {
  try {
    const nevent = nip19.neventEncode({ id: eventId, author: PUBKEY });
    return `https://njump.me/${nevent}`;
  } catch {
    return `https://njump.me/${eventId}`;
  }
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

async function fetchStats(noteId) {
  const events = await pool.querySync(RELAYS, { kinds: [1, 7, 9735], '#e': [noteId] }, { maxWait: 1500 });
  const stats = { likes: 0, replies: 0, zapTotal: 0 };
  events.forEach(event => {
    if (event.kind === 7) stats.likes++;
    else if (event.kind === 1) stats.replies++;
    else if (event.kind === 9735) {
      const bolt11 = event.tags.find(t => t[0] === 'bolt11');
      if (bolt11) stats.zapTotal += decodeBolt11Amount(bolt11[1]);
    }
  });
  return stats;
}

function extractMentionPubkeys(text) {
  const pubkeys = [];
  const pattern = /(?:nostr:|@)(npub1[a-z0-9]+|nprofile1[a-z0-9]+|naddr1[a-z0-9]+)/g;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    try {
      const decoded = nip19.decode(m[1]);
      if (decoded.type === 'naddr') continue;
      const pk = decoded.type === 'npub' ? decoded.data : decoded.data?.pubkey;
      if (pk && !pubkeys.includes(pk)) pubkeys.push(pk);
    } catch { /* skip */ }
  }
  return pubkeys;
}

function renderNote(event, profile, mentionProfiles = {}) {
  const text = event.content;
  const date = formatDate(event.created_at);
  const url = noteUrl(event.id);

  const el = document.createElement('div');
  el.className = 'nostr-note bg-offwhite padding-small';

  const author = document.createElement('div');
  author.className = 'nostr-note__author';

  if (profile?.picture) {
    const img = document.createElement('img');
    img.src = profile.picture;
    img.alt = profile.name || 'NoGood';
    img.className = 'nostr-note__avatar';
    author.appendChild(img);
  }

  const name = document.createElement('a');
  name.href = `https://njump.me/${nip19.npubEncode(PUBKEY)}`;
  name.target = '_blank';
  name.rel = 'noopener';
  name.className = 'nostr-note__name';
  name.textContent = profile?.name || 'NoGood';
  author.appendChild(name);

  const content = document.createElement('p');
  const tokenPattern = /(https?:\/\/[^\s]+)|(?:nostr:|@)(npub1[a-z0-9]+|nprofile1[a-z0-9]+|naddr1[a-z0-9]+|nevent1[a-z0-9]+)/g;
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      content.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1]) {
      const a = document.createElement('a');
      a.href = match[1];
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = match[1].length > 30 ? match[1].slice(0, 30) + '…' : match[1];
      content.appendChild(a);
    } else if (match[2]) {
      try {
        const decoded = nip19.decode(match[2]);
        const a = document.createElement('a');
        a.href = `https://njump.me/${match[2]}`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'nostr-mention';
        if (decoded.type === 'naddr') {
          a.textContent = decoded.data?.identifier || 'nostr event';
        } else if (decoded.type === 'nevent') {
          a.textContent = `nostr:${match[2].slice(0, 12)}…`;
        } else {
          const pk = decoded.type === 'npub' ? decoded.data : decoded.data?.pubkey;
          const mentionProfile = pk ? mentionProfiles[pk] : null;
          a.textContent = `@${mentionProfile?.display_name || mentionProfile?.name || match[2].slice(0, 12) + '…'}`;
        }
        content.appendChild(a);
      } catch {
        content.appendChild(document.createTextNode(match[0]));
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    content.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  const meta = document.createElement('div');
  meta.className = 'nostr-note__meta';

  const dateEl = document.createElement('span');
  dateEl.className = 'tag pixel-font';
  dateEl.textContent = date;

  const stats = document.createElement('div');
  stats.className = 'nostr-note__stats';

  const likesEl = document.createElement('span');
  const repliesEl = document.createElement('span');
  const zapEl = document.createElement('span');
  stats.appendChild(likesEl);
  stats.appendChild(repliesEl);
  stats.appendChild(zapEl);

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.className = 'nostr-note__link hide-small text-small';
  link.textContent = 'View on Nostr';

  const metaLeft = document.createElement('div');
  metaLeft.className = 'nostr-note__meta-left';
  metaLeft.appendChild(dateEl);
  metaLeft.appendChild(stats);

  meta.appendChild(metaLeft);
  meta.appendChild(link);
  el.appendChild(author);
  el.appendChild(content);
  el.appendChild(meta);
  container.appendChild(el);

  fetchStats(event.id).then(s => {
    likesEl.textContent = `${s.likes} likes`;
    repliesEl.textContent = `${s.replies} comments`;
    zapEl.textContent = `${formatSats(s.zapTotal)} sats`;
  });
}

async function init() {
  const [noteEvents, profileEvents] = await Promise.all([
    pool.querySync(RELAYS, { kinds: [1], authors: [PUBKEY], limit: 20 }, { maxWait: 1500 }),
    pool.querySync(RELAYS, { kinds: [0], authors: [PUBKEY] }, { maxWait: 1500 }),
  ]);

  const note = noteEvents
    .sort((a, b) => b.created_at - a.created_at)
    .find(e => !e.tags.some(t => t[0] === 'e'));

  let profile = null;
  if (profileEvents.length) {
    try { profile = JSON.parse(profileEvents[0].content); } catch { /* noop */ }
  }

  if (!note) return;

  const mentionPubkeys = extractMentionPubkeys(note.content);
  let mentionProfiles = {};
  if (mentionPubkeys.length) {
    const mentionEvents = await pool.querySync(RELAYS, { kinds: [0], authors: mentionPubkeys }, { maxWait: 1500 });
    mentionEvents.forEach(e => {
      try { mentionProfiles[e.pubkey] = JSON.parse(e.content); } catch { /* skip */ }
    });
  }

  renderNote(note, profile, mentionProfiles);
}

init();
