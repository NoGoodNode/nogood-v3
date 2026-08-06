function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function keyPart(value) {
  return encodeURIComponent(value || 'unknown');
}

function read(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function write(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Local convenience state only. Nostr relays remain the source of truth.
 * Account keys are intentionally shared by every NoGood overlay; stream keys
 * are scoped to an individual naddr/a-tag.
 */
export function createOverlayState({ accountPubkey, streamATag }) {
  const storage = safeStorage();
  const accountPrefix = `ng-account:${keyPart(accountPubkey)}`;
  const streamPrefix = `ng-stream:${keyPart(streamATag)}`;

  return {
    getAccount(name, fallback = null) {
      return read(storage, `${accountPrefix}:${name}`, fallback);
    },
    setAccount(name, value) {
      write(storage, `${accountPrefix}:${name}`, value);
    },
    getStream(name, fallback = null) {
      return read(storage, `${streamPrefix}:${name}`, fallback);
    },
    setStream(name, value) {
      write(storage, `${streamPrefix}:${name}`, value);
    },
  };
}
