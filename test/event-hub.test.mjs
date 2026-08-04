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
