/**
 * Appends a chat element while smoothly moving visible older messages upward.
 * The caller creates the message element, so this works for normal chat,
 * zaps, raids, or any future overlay message type.
 */
export function appendAnimatedChatMessage(container, element, { maxMessages = 200 } = {}) {
  const viewport = container.parentElement;
  const viewportRect = viewport.getBoundingClientRect();
  const existing = [...container.children]
    .map(child => ({ child, rect: child.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > viewportRect.top && rect.top < viewportRect.bottom);

  const stagger = 30;
  const motionDuration = 150;
  const enterDelay = Math.max(0, (existing.length - 1) * stagger + motionDuration);
  element.style.setProperty('--chat-enter-delay', `${enterDelay}ms`);
  element.classList.add('chat-message--enter');
  container.appendChild(element);

  while (container.children.length > maxMessages) {
    container.firstElementChild.remove();
  }

  existing.forEach(({ child, rect }, index) => {
    if (!child.isConnected) return;
    const offset = rect.top - child.getBoundingClientRect().top;
    if (Math.abs(offset) < 0.5) return;

    if (child.animate) {
      child.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: 'translateY(0)' },
        ],
        {
          duration: motionDuration,
          delay: index * stagger,
          easing: 'ease',
          fill: 'both',
        },
      );
      return;
    }

    child.style.transition = 'none';
    child.style.transform = `translateY(${offset}px)`;
    void child.offsetHeight;
    requestAnimationFrame(() => {
      child.style.transition = `transform var(--duration-normal) var(--ease) ${index * stagger}ms`;
      child.style.transform = '';
    });
  });
}
