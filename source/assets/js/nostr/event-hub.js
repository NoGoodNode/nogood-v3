import { SimplePool } from '../vendor/nostr-pool.js';
import { NOGOOD_NOSTR_RELAYS } from './config.js';

export { NOGOOD_NOSTR_RELAYS };

let sharedHub = null;

export function createEventHub({ relays = NOGOOD_NOSTR_RELAYS, pool = new SimplePool({ enableReconnect: true }) } = {}) {
  const profileCache = new Map();

  // Keep live feeds bounded: consumers can still receive every event, while
  // late subscribers replay only the most recent retained history.
  function createFeed({ filters, historyTimeout = 6000, maxEvents = 500 }) {
    const events = new Map();
    const subscribers = new Set();
    const requests = relays.flatMap(url => filters.map(filter => ({ url, filter })));
    let ready = false;
    let subscription = null;
    let timeout = null;

    function finishHistory() {
      if (ready) return;
      ready = true;
      if (timeout) clearTimeout(timeout);
      subscribers.forEach(({ onReady }) => onReady?.());
    }

    function retain(event, isHistorical) {
      if (events.has(event.id)) return;
      events.set(event.id, event);
      if (events.size > maxEvents) {
        const oldest = [...events.values()].reduce((oldest, candidate) =>
          candidate.created_at < oldest.created_at ? candidate : oldest
        );
        events.delete(oldest.id);
      }
      subscribers.forEach(({ onEvent }) => onEvent?.(event, isHistorical));
    }

    subscription = pool.subscribeMap(requests, {
      onevent(event) {
        retain(event, !ready);
      },
      oneose() {
        finishHistory();
      },
    });
    timeout = setTimeout(finishHistory, historyTimeout);

    return {
      subscribe({ onEvent, onReady }) {
        [...events.values()]
          .sort((a, b) => a.created_at - b.created_at)
          .forEach(event => onEvent?.(event, true));
        const subscriber = { onEvent, onReady };
        subscribers.add(subscriber);
        if (ready) onReady?.();
        return () => subscribers.delete(subscriber);
      },
      close() {
        if (timeout) clearTimeout(timeout);
        subscription?.close();
        subscribers.clear();
      },
      get events() {
        return [...events.values()].sort((a, b) => a.created_at - b.created_at);
      },
    };
  }

  return {
    relays,
    createFeed,
    query(filters, options = {}) {
      return pool.querySync(options.relays || relays, filters, { maxWait: options.maxWait || 3000 });
    },
    async fetchProfile(pubkey) {
      if (!profileCache.has(pubkey)) {
        profileCache.set(pubkey, this.query({ kinds: [0], authors: [pubkey], limit: 1 })
          .then(events => {
            if (!events.length) return { name: pubkey.slice(0, 8), picture: null };
            const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
            try {
              const profile = JSON.parse(latest.content);
              return {
                name: profile.display_name || profile.name || pubkey.slice(0, 8),
                picture: profile.picture || null,
                ...profile,
              };
            } catch {
              return { name: pubkey.slice(0, 8), picture: null };
            }
          })
        );
      }
      return profileCache.get(pubkey);
    },
    close() {
      pool.close(relays);
      if (sharedHub?.pool === pool) sharedHub = null;
    },
    pool,
  };
}

export function getEventHub(options) {
  if (!sharedHub) {
    const hub = createEventHub(options);
    sharedHub = { hub, pool: hub.pool };
  }
  return sharedHub.hub;
}
