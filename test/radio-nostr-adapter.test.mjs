import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const asModuleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('Radio adapter replays stream chat received before subscribeChat', async () => {
  let feedHandlers;
  const hub = {
    createFeed() {
      return {
        subscribe(handlers) {
          feedHandlers = handlers;
          return () => {};
        },
        close() {},
      };
    },
  };
  const source = await readFile(new URL('../source/assets/js/radio/nostr.js', import.meta.url), 'utf8');
  const moduleSource = source
    .replace("import { getEventHub } from '/assets/js/nostr/event-hub.js';", `import { getEventHub } from '${asModuleUrl('export function getEventHub() { throw new Error(\'unexpected default hub\'); }')}';`)
    .replace("import { NOGOOD_PUBKEY } from '/assets/js/nostr/config.js';", `import { NOGOOD_PUBKEY } from '${asModuleUrl("export const NOGOOD_PUBKEY = 'profile-pubkey';")}';`)
    .replace("import { parseZapReceipt } from '/assets/js/nostr/zaps.js';", `import { parseZapReceipt } from '${asModuleUrl('export function parseZapReceipt() { return null; }')}';`)
    .replace("import * as nip19 from '/assets/js/vendor/nostr-nip19.js';", `import * as nip19 from '${asModuleUrl('export function decode() {} export function npubEncode(value) { return value; }')}';`);
  const { createRadioNostr } = await import(asModuleUrl(moduleSource));
  const radio = createRadioNostr({
    naddr: 'naddr',
    relays: ['wss://relay.example'],
    hub,
    decodeNaddr: () => ({ type: 'naddr', data: { pubkey: 'stream-pubkey', identifier: 'stream-id' } }),
  });

  feedHandlers.onEvent({
    id: 'chat-1',
    kind: 1311,
    pubkey: 'speaker',
    content: 'hello',
    created_at: 1,
    tags: [['a', '30311:stream-pubkey:stream-id']],
  }, true);
  feedHandlers.onReady();

  const received = [];
  let ready = 0;
  radio.subscribeChat((message, isHistorical) => received.push({ message, isHistorical }), () => { ready += 1; });

  assert.deepEqual(received, [{
    message: { id: 'chat-1', pubkey: 'speaker', content: 'hello', timestamp: 1, tags: [['a', '30311:stream-pubkey:stream-id']] },
    isHistorical: true,
  }]);
  assert.equal(ready, 1);
});
