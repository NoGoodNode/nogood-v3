import { verifyEvent } from '../vendor/nostr-pool.js';

export function parseZapReceipt(receipt, { expectedATag = null, verify = verifyEvent } = {}) {
  if (receipt?.kind !== 9735 || !verify(receipt)) return null;

  const description = tagValue(receipt, 'description');
  const bolt11 = tagValue(receipt, 'bolt11');
  if (!description || !bolt11) return null;

  let request;
  try {
    request = JSON.parse(description);
  } catch {
    return null;
  }
  if (request.kind !== 9734 || !verify(request)) return null;

  const requestRecipients = tagValues(request, 'p');
  const receiptRecipients = tagValues(receipt, 'p');
  if (!requestRecipients.length || !receiptRecipients.length) return null;
  if (!requestRecipients.some(pubkey => receiptRecipients.includes(pubkey))) return null;
  if (expectedATag && !tagValues(request, 'a').includes(expectedATag)) return null;

  return {
    id: receipt.id,
    amount: decodeBolt11Amount(bolt11),
    senderPubkey: request.pubkey || null,
    timestamp: receipt.created_at,
    content: request.content || '',
  };
}

export function decodeBolt11Amount(bolt11) {
  const match = bolt11?.match(/^lnbc(\d+)([munp]?)/i);
  if (!match) return 0;
  const amount = parseInt(match[1], 10);
  switch (match[2]) {
    case 'm': return amount * 100000;
    case 'u': return amount * 100;
    case 'n': return Math.floor(amount / 10);
    case 'p': return Math.floor(amount / 10000);
    default: return amount * 100000000;
  }
}

function tagValues(event, name) {
  return event.tags.filter(tag => tag[0] === name).map(tag => tag[1]).filter(Boolean);
}

function tagValue(event, name) {
  return tagValues(event, name)[0] || null;
}
