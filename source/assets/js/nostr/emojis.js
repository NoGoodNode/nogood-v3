/** Safely render a Nostr display name with its profile-defined custom emoji. */
const CUSTOM_EMOJI = /:([a-zA-Z0-9_-]+):/g;

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function appendUnicodeEmojiText(fragment, text) {
  if (!text) return;
  if (!Intl.Segmenter) {
    fragment.append(document.createTextNode(text));
    return;
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(text)) {
    if (/\p{Extended_Pictographic}/u.test(segment)) {
      const emoji = document.createElement('span');
      emoji.className = 'nostr-unicode-emoji';
      emoji.textContent = segment;
      fragment.append(emoji);
    } else {
      fragment.append(document.createTextNode(segment));
    }
  }
}

export function renderNostrName(element, name, emojis = {}) {
  const text = String(name || 'anon');
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of text.matchAll(CUSTOM_EMOJI)) {
    const imageUrl = safeImageUrl(emojis[match[1]]);
    if (!imageUrl) continue;

    appendUnicodeEmojiText(fragment, text.slice(cursor, match.index));
    const image = document.createElement('img');
    image.className = 'nostr-emoji';
    image.src = imageUrl;
    image.alt = match[0];
    image.title = match[0];
    fragment.append(image);
    cursor = match.index + match[0].length;
  }

  appendUnicodeEmojiText(fragment, text.slice(cursor));
  element.replaceChildren(fragment);
}
