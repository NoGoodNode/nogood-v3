import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const asModuleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadFilter() {
  const source = await readFile(new URL('../source/assets/js/nostr/chat-moderation.js', import.meta.url), 'utf8');
  const moduleSource = source.replace(
    "import * as nip19 from '../vendor/nostr-nip19.js';",
    `import * as nip19 from '${asModuleUrl("export function decode() { throw new Error('not needed in this test'); }")}';`
  );
  return (await import(asModuleUrl(moduleSource))).createChatSpamFilter;
}

test('chat moderation hides multi-link and link-promo messages immediately', async () => {
  const createChatSpamFilter = await loadFilter();
  const filter = createChatSpamFilter();

  assert.equal(filter({ pubkey: 'spam', timestamp: 1, content: 'https://one.test https://two.test' }).hidden, true);
  assert.equal(filter({ pubkey: 'spam', timestamp: 2, content: 'Claim your wallet token: https://example.test' }).hidden, true);
});

test('chat moderation hides promotional follow-ups from a recent link sender', async () => {
  const createChatSpamFilter = await loadFilter();
  const filter = createChatSpamFilter();

  assert.equal(filter({ pubkey: 'spam', timestamp: 100, content: 'https://example.test/profile' }).hidden, false);
  const result = filter({ pubkey: 'spam', timestamp: 130, content: 'Add your BCH address to receive zaps' });
  assert.equal(result.hidden, true);
  assert.deepEqual(result.reasons, ['link-promo-followup']);
});

test('chat moderation allows ordinary single-link and conversational messages', async () => {
  const createChatSpamFilter = await loadFilter();
  const filter = createChatSpamFilter();

  assert.equal(filter({ pubkey: 'listener', timestamp: 1, content: 'Great track' }).hidden, false);
  assert.equal(filter({ pubkey: 'listener', timestamp: 2, content: 'This track is on https://example.test' }).hidden, false);
});
