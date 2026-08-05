import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventHub } from '../source/assets/js/nostr/event-hub.js';

function createPool() {
  return {
    handlers: null,
    subscribeMap(_, handlers) {
      this.handlers = handlers;
      return { close() {} };
    },
    async querySync() {
      return [];
    },
    close() {},
  };
}

test('delivers events received before a consumer subscribes as history', () => {
  const pool = createPool();
  const hub = createEventHub({ relays: ['wss://relay.example'], pool });
  const feed = hub.createFeed({ filters: [{ kinds: [1] }] });

  pool.handlers.onevent({ id: 'first', kind: 1, created_at: 1, tags: [] });
  pool.handlers.oneose();

  const received = [];
  let ready = 0;
  feed.subscribe({
    onEvent(event, isHistorical) {
      received.push({ id: event.id, isHistorical });
    },
    onReady() {
      ready += 1;
    },
  });

  assert.deepEqual(received, [{ id: 'first', isHistorical: true }]);
  assert.equal(ready, 1);
});

test('retains only the newest configured event history and deduplicates IDs', () => {
  const pool = createPool();
  const hub = createEventHub({ relays: ['wss://relay.example'], pool });
  const feed = hub.createFeed({ filters: [{ kinds: [1] }], maxEvents: 2 });

  pool.handlers.onevent({ id: 'oldest', kind: 1, created_at: 1, tags: [] });
  pool.handlers.onevent({ id: 'middle', kind: 1, created_at: 2, tags: [] });
  pool.handlers.onevent({ id: 'middle', kind: 1, created_at: 2, tags: [] });
  pool.handlers.onevent({ id: 'newest', kind: 1, created_at: 3, tags: [] });
  pool.handlers.oneose();

  assert.deepEqual(feed.events.map(event => event.id), ['middle', 'newest']);
});

test('marks events as live and becomes ready when relays send EOSE', () => {
  const pool = createPool();
  const hub = createEventHub({ relays: ['wss://relay.example'], pool });
  const feed = hub.createFeed({ filters: [{ kinds: [1] }] });
  const received = [];
  feed.subscribe({ onEvent: (_, isHistorical) => received.push(isHistorical) });

  pool.handlers.oneose();
  pool.handlers.onevent({ id: 'live', kind: 1, created_at: 1, tags: [] });

  assert.deepEqual(received, [false]);
});

test('becomes ready after the history timeout when relays do not send EOSE', async () => {
  const pool = createPool();
  const hub = createEventHub({ relays: ['wss://relay.example'], pool });
  const feed = hub.createFeed({ filters: [{ kinds: [1] }], historyTimeout: 5 });
  let ready = 0;
  feed.subscribe({ onReady: () => { ready += 1; } });

  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(ready, 1);
  feed.close();
});
