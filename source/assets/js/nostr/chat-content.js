import * as nip19 from '../vendor/nostr-nip19.js';

const NOSTR_EVENT_REFERENCE_PATTERN = /nostr:(?:note1|nevent1|naddr1)[a-z0-9]+/gi;
const CHAT_TOKEN_PATTERN = /(https?:\/\/[^\s]+)|(nostr:(?:note1|nevent1|naddr1)[a-z0-9]+)|(?:nostr:|@)(npub1[a-z0-9]+|nprofile1[a-z0-9]+)|:([a-zA-Z0-9_]+):/g;

export function shortenNostrReference(reference, maxLength = 20) {
  return reference.length > maxLength ? `${reference.slice(0, maxLength)}…` : reference;
}

export function shortenNostrEventReferences(content = '', maxLength = 20) {
  return content.replace(NOSTR_EVENT_REFERENCE_PATTERN, reference => shortenNostrReference(reference, maxLength));
}

// Renders safe, non-clickable external URLs, shortened Nostr event references,
// resolved profile mentions, and declared custom emojis.
export function renderChatContent(el, text, {
  emojiMap = {},
  fetchProfile,
  linkClass,
  mentionClass,
  emojiClass,
  mentionLink = false,
  profileName = profile => profile?.name,
} = {}) {
  let lastIndex = 0;
  let match;
  CHAT_TOKEN_PATTERN.lastIndex = 0;

  while ((match = CHAT_TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) el.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));

    if (match[1] || match[2]) {
      const span = document.createElement('span');
      span.className = linkClass;
      span.textContent = match[1]
        ? (match[1].length > 30 ? `${match[1].slice(0, 30)}…` : match[1])
        : shortenNostrReference(match[2]);
      el.appendChild(span);
    } else if (match[3]) {
      try {
        const decoded = nip19.decode(match[3]);
        const pubkey = decoded.type === 'npub' ? decoded.data : decoded.data?.pubkey;
        const mention = document.createElement(mentionLink ? 'a' : 'span');
        mention.className = mentionClass;
        if (mentionLink) {
          mention.href = `https://njump.me/${match[3]}`;
          mention.target = '_blank';
          mention.rel = 'noopener';
        }
        const fallback = `@${match[3].slice(0, 12)}…`;
        mention.textContent = fallback;
        if (pubkey && fetchProfile) {
          fetchProfile(pubkey).then(profile => {
            mention.textContent = `@${profileName(profile) || match[3].slice(0, 12)}…`;
          }).catch(() => {});
        }
        el.appendChild(mention);
      } catch {
        el.appendChild(document.createTextNode(match[0]));
      }
    } else if (match[4] && emojiMap[match[4]]) {
      const image = document.createElement('img');
      image.src = emojiMap[match[4]];
      image.alt = `:${match[4]}:`;
      image.className = emojiClass;
      el.appendChild(image);
    } else {
      el.appendChild(document.createTextNode(match[0]));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) el.appendChild(document.createTextNode(text.slice(lastIndex)));
}
