// Conservative local presentation filter for stream chat.
// It intentionally combines signals instead of using a broad banned-word list.
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+/gi;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_-]+/gu;
const PROMO_TERMS = /\b(?:onlyfans|camgirl|escort|adult|nsfw|xxx|porn|nude|dating|telegram|whatsapp)\b/gi;

export function createChatSpamFilter({ threshold = 5 } = {}) {
  const recentByPubkey = new Map();
  const recentFingerprints = new Map();

  function prune(now) {
    for (const [pubkey, timestamps] of recentByPubkey) {
      const kept = timestamps.filter(timestamp => now - timestamp < 60_000);
      if (kept.length) recentByPubkey.set(pubkey, kept);
      else recentByPubkey.delete(pubkey);
    }
    for (const [fingerprint, timestamp] of recentFingerprints) {
      if (now - timestamp >= 120_000) recentFingerprints.delete(fingerprint);
    }
  }

  return function shouldHideChatMessage({ pubkey = '', content = '', timestamp = 0 }) {
    const now = timestamp ? timestamp * 1000 : Date.now();
    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    const urls = normalized.match(URL_PATTERN)?.length || 0;
    const hashtags = normalized.match(HASHTAG_PATTERN)?.length || 0;
    const promoTerms = normalized.match(PROMO_TERMS)?.length || 0;
    const reasons = [];
    let score = 0;

    prune(now);
    const fingerprints = recentFingerprints.get(normalized);
    const timestamps = recentByPubkey.get(pubkey) || [];

    if (hashtags >= 8) {
      score += 5;
      reasons.push('hashtag-flood');
    } else if (urls && hashtags >= 4) {
      score += 5;
      reasons.push('link-hashtag-promo');
    }
    if (urls >= 3) {
      score += 5;
      reasons.push('multi-link');
    }
    if (urls && promoTerms >= 3) {
      score += 4;
      reasons.push('link-promo-terms');
    }
    if (fingerprints) {
      score += 5;
      reasons.push('duplicate-message');
    }
    if (timestamps.length >= 3) {
      score += 3;
      reasons.push('rapid-sender');
    }

    if (normalized) recentFingerprints.set(normalized, now);
    recentByPubkey.set(pubkey, [...timestamps, now]);
    return { hidden: score >= threshold, score, reasons };
  };
}
