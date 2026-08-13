// Shared lifecycle for rendered Nostr chat messages. Each surface supplies its
// own markup through renderMessage(), while moderation and feed bookkeeping stay
// consistent across the site.
export function createChatFeed({
  getContainer,
  shouldHideMessage,
  renderMessage,
  maxMessages = 200,
  canRenderMessage = () => true,
  placeMessage,
}) {
  const seenMessageIds = new Set();

  function insertInOrder(container, element, timestamp) {
    element.dataset.ts = String(timestamp || 0);
    const newer = [...container.children].find(child => Number(child.dataset.ts) > timestamp);
    if (newer) container.insertBefore(element, newer);
    else container.appendChild(element);
    while (container.children.length > maxMessages) container.firstElementChild?.remove();
    if (!newer) container.scrollTop = container.scrollHeight;
  }

  function append(message, { isHistorical = false } = {}) {
    if (!message?.id || seenMessageIds.has(message.id)) return { rendered: false, reason: 'duplicate-event' };
    seenMessageIds.add(message.id);

    const moderation = shouldHideMessage?.(message) || { hidden: false };
    if (moderation.hidden) return { rendered: false, reason: 'moderated', moderation };
    if (!canRenderMessage(message)) return { rendered: false, reason: 'rate-limited' };

    const container = getContainer?.();
    if (!container) return { rendered: false, reason: 'missing-container' };
    const element = renderMessage(message);
    if (!element) return { rendered: false, reason: 'missing-element' };

    if (placeMessage) {
      placeMessage({ container, element, message, isHistorical, insertInOrder });
      while (container.children.length > maxMessages) container.firstElementChild?.remove();
    } else {
      insertInOrder(container, element, message.timestamp);
    }
    return { rendered: true, element };
  }

  return { append, insertInOrder };
}
