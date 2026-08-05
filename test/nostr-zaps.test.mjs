import assert from 'node:assert/strict';
import test from 'node:test';
import { parseZapReceipt } from '../source/assets/js/nostr/zaps.js';

function receipt({ request, recipients = ['recipient'], bolt11 = 'lnbc10u' } = {}) {
  return {
    id: 'receipt',
    kind: 9735,
    created_at: 100,
    tags: [
      ['p', ...recipients],
      ['bolt11', bolt11],
      ['description', JSON.stringify(request)],
    ],
  };
}

function request({ recipients = ['recipient'], aTag = '30311:stream:show' } = {}) {
  return {
    id: 'request',
    kind: 9734,
    pubkey: 'sender',
    content: 'Thank you',
    tags: [['p', ...recipients], ['a', aTag]],
  };
}

test('parses a signed zap receipt whose request targets the same recipient', () => {
  const zap = parseZapReceipt(receipt({ request: request() }), {
    expectedATag: '30311:stream:show',
    verify: () => true,
  });

  assert.deepEqual(zap, {
    id: 'receipt',
    amount: 1000,
    senderPubkey: 'sender',
    timestamp: 100,
    content: 'Thank you',
  });
});

test('rejects zap receipts with an invalid request or mismatched recipient', () => {
  assert.equal(parseZapReceipt(receipt({ request: request() }), { verify: () => false }), null);
  assert.equal(parseZapReceipt(receipt({ request: request({ recipients: ['another-recipient'] }) }), {
    verify: () => true,
  }), null);
});
