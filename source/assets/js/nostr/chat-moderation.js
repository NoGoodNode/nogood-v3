// Conservative local presentation filter for stream chat.
// It combines message-level signals with a short, in-memory sender window;
// no chatter profiles or long-term message history are stored.
import * as nip19 from '../vendor/nostr-nip19.js';

// Add selected accounts here as npubs. This is local NoGood presentation moderation,
// not a published Nostr mute list.
const MANUAL_MUTED_NPUBS = [
  'npub1gjdw8nwepju7uj2dra58x946zd3l7ytd7wkkl3ck2vkar63ytpcstgr3wy',
  'npub15zv2gq80fl6q4ysrzjfhxfwxkyuf4a6e7k3sfxpw2ucfcgyyen6q7xf2w4', // CashDragon
];

const MANUAL_MUTED_PUBKEYS = new Set(MANUAL_MUTED_NPUBS.flatMap(npub => {
  try {
    const decoded = nip19.decode(npub);
    return decoded.type === 'npub' ? [decoded.data] : [];
  } catch {
    return [];
  }
}));

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+/gi;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_-]+/gu;
const PROMO_TERMS = /\b(?:onlyfans|camgirl|escort|adult|nsfw|xxx|porn|nude|dating|telegram|whatsapp|airdrop|giveaway|claim|wallet|address|token|exchange|trading|invest|profit|earn|bch)\b/gi;
const SENDER_WINDOW_MS = 60_000;
const LINK_FOLLOWUP_WINDOW_MS = 90_000;
const FINGERPRINT_WINDOW_MS = 120_000;

export function createChatSpamFilter({ threshold = 5 } = {}) {
  const recentByPubkey = new Map();
  const recentFingerprints = new Map();

  function prune(now) {
    for (const [pubkey, messages] of recentByPubkey) {
      const kept = messages.filter(message => now - message.timestamp < LINK_FOLLOWUP_WINDOW_MS);
      if (kept.length) recentByPubkey.set(pubkey, kept);
      else recentByPubkey.delete(pubkey);
    }
    for (const [fingerprint, timestamp] of recentFingerprints) {
      if (now - timestamp >= FINGERPRINT_WINDOW_MS) recentFingerprints.delete(fingerprint);
    }
  }

  return function shouldHideChatMessage({ pubkey = '', content = '', timestamp = 0 }) {
    const now = timestamp ? timestamp * 1000 : Date.now();
    if (MANUAL_MUTED_PUBKEYS.has(pubkey)) {
      return { hidden: true, score: 999, reasons: ['manual-mute'] };
    }

    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    const urls = normalized.match(URL_PATTERN)?.length || 0;
    const hashtags = normalized.match(HASHTAG_PATTERN)?.length || 0;
    const promoTerms = normalized.match(PROMO_TERMS)?.length || 0;
    const reasons = [];
    let score = 0;

    prune(now);
    const recentMessages = recentByPubkey.get(pubkey) || [];
    const recentSenderMessages = recentMessages.filter(message => now - message.timestamp < SENDER_WINDOW_MS);
    const recentlySharedLink = recentMessages.some(message => message.urls > 0);

    if (hashtags >= 5) {
      score += 5;
      reasons.push('hashtag-flood');
    }
    if (urls >= 2) {
      score += 5;
      reasons.push('multi-link');
    }
    if (urls && promoTerms >= 2) {
      score += 5;
      reasons.push('link-promo');
    }
    if (recentlySharedLink && promoTerms >= 2) {
      score += 5;
      reasons.push('link-promo-followup');
    }
    if (recentFingerprints.has(normalized)) {
      score += 5;
      reasons.push('duplicate-message');
    }
    if (recentSenderMessages.length >= 3 && (urls || promoTerms)) {
      score += 5;
      reasons.push('rapid-promo-sender');
    }

    if (normalized) recentFingerprints.set(normalized, now);
    recentByPubkey.set(pubkey, [...recentMessages, { timestamp: now, urls, promoTerms }]);
    return { hidden: score >= threshold, score, reasons };
  };
}
