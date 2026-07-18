import QRCode from '/assets/js/vendor/qrcode.js';
import { getStreamATag, getRelays, getPool } from './nostr.js';

const RECIPIENT_PUBKEY = '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185';

let weblnEnabled = false;

let zapLud16 = null;

export function configureZap(lud16) {
  zapLud16 = lud16;
}

export async function sendZap(amountSats, message = '') {
  const statusEl = document.getElementById('zap-status');
  const setStatus = (msg, type = '') => {
    statusEl.textContent = msg;
    statusEl.className = 'zap-status' + (type ? ` zap-status--${type}` : '');
  };

  try {
    if (!zapLud16) {
      setStatus('Zap recipient not configured', 'error');
      return;
    }

    setStatus('Resolving lightning address...');
    async function fetchLnurl(lud16) {
      const [username, domain] = lud16.split('@');
      const res = await fetch(`https://${domain}/.well-known/lnurlp/${username}`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json();
      return data.callback ? data : null;
    }
    async function fetchInvoice(lnurlData, amountMsats, zapRequestEvent) {
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set('amount', amountMsats.toString());
      if (zapRequestEvent) callbackUrl.searchParams.set('nostr', JSON.stringify(zapRequestEvent));
      const res = await fetch(callbackUrl.toString(), { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json();
      return data.pr ? data : null;
    }
    const lnurlData = await fetchLnurl(zapLud16);
    if (!lnurlData) {
      setStatus('Could not reach lightning service', 'error');
      return;
    }

    const amountMsats = amountSats * 1000;
    if (lnurlData.minSendable && amountMsats < lnurlData.minSendable) {
      setStatus(`Minimum ${Math.ceil(lnurlData.minSendable / 1000)} sats`, 'error');
      return;
    }
    if (lnurlData.maxSendable && amountMsats > lnurlData.maxSendable) {
      setStatus(`Maximum ${Math.floor(lnurlData.maxSendable / 1000)} sats`, 'error');
      return;
    }

    setStatus('Creating zap request...');
    let zapRequestEvent = null;
    const relays = getRelays();
    const streamATag = getStreamATag();

    if (lnurlData.allowsNostr && lnurlData.nostrPubkey) {
      const zapRequest = {
        kind: 9734,
        created_at: Math.floor(Date.now() / 1000),
        content: message,
        tags: [
          ['relays', ...relays],
          ['amount', amountMsats.toString()],
          ['p', RECIPIENT_PUBKEY],
          ['a', streamATag],
        ],
      };

      if (window.nostr) {
        try {
          zapRequestEvent = await window.nostr.signEvent(zapRequest);
        } catch {
          zapRequestEvent = null;
        }
      }
    }

    setStatus('Getting invoice...');
    const invoiceData = await fetchInvoice(lnurlData, amountMsats, zapRequestEvent);
    if (!invoiceData) {
      setStatus('Could not get invoice', 'error');
      return;
    }

    if (window.webln) {
      try {
        if (!weblnEnabled) {
          await window.webln.enable();
          weblnEnabled = true;
        }
        setStatus('Paying...');
        await window.webln.sendPayment(invoiceData.pr);
        setStatus(`Zapped ${amountSats} sats!`, 'success');
        setTimeout(() => setStatus(''), 3000);
        return;
      } catch (err) {
        if (err.message?.includes('User rejected') || err.message?.includes('cancelled')) {
          setStatus('Payment cancelled', 'error');
          setTimeout(() => setStatus(''), 4000);
          return;
        }
      }
    }

    setStatus('');
    showInvoiceModal(invoiceData.pr, amountSats, RECIPIENT_PUBKEY);

  } catch (err) {
    if (err.message?.includes('User rejected') || err.message?.includes('cancelled')) {
      setStatus('Payment cancelled', 'error');
    } else {
      setStatus('Zap failed — try again', 'error');
      console.error('Zap error:', err);
    }
    setTimeout(() => setStatus(''), 4000);
  }
}

function showInvoiceModal(invoice, amountSats, recipientPubkey) {
  const modal = document.getElementById('zap-modal');
  const canvas = document.getElementById('zap-modal-qr');
  const amountEl = document.getElementById('zap-modal-amount');
  const copyBtn = document.getElementById('zap-modal-copy');
  const openLink = document.getElementById('zap-modal-open');
  const closeBtn = document.getElementById('zap-modal-close');
  const backdrop = modal.querySelector('.zap-modal__backdrop');

  amountEl.textContent = `${amountSats} sats`;
  openLink.href = `lightning:${invoice}`;

  QRCode.toCanvas(canvas, invoice.toUpperCase(), {
    width: 200,
    margin: 0,
    color: { dark: '#000', light: '#fff' },
  });

  let receiptSub = null;
  const pool = getPool();
  const relays = getRelays();
  const invoiceLower = invoice.toLowerCase();

  if (pool) {
    const since = Math.floor(Date.now() / 1000) - 10;
    receiptSub = pool.subscribeMany(
      relays,
      { kinds: [9735], '#p': [recipientPubkey], since },
      {
        onevent(event) {
          const bolt11Tag = event.tags.find((t) => t[0] === 'bolt11');
          if (bolt11Tag && bolt11Tag[1].toLowerCase() === invoiceLower) {
            onPaid();
          }
        },
      }
    );
  }

  const watchTimeout = setTimeout(() => {
    if (receiptSub) receiptSub.close();
  }, 600000);

  function onPaid() {
    if (receiptSub) receiptSub.close();
    clearTimeout(watchTimeout);
    modal.hidden = true;
    cleanup();
  }

  function handleCopy() {
    const copied = () => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy invoice'; }, 2000);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(invoice).then(copied);
    } else {
      const ta = document.createElement('textarea');
      ta.value = invoice;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copied();
    }
  }

  function cleanup() {
    copyBtn.removeEventListener('click', handleCopy);
    closeBtn.removeEventListener('click', close);
    backdrop.removeEventListener('click', close);
  }

  function close() {
    modal.hidden = true;
    if (receiptSub) receiptSub.close();
    clearTimeout(watchTimeout);
    cleanup();
  }

  copyBtn.addEventListener('click', handleCopy);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  modal.hidden = false;
}


export function initZapButtons() {
  const messageInput = document.getElementById('zap-message-input');
  const getMessage = () => messageInput?.value.trim() || '';

  const buttons = document.querySelectorAll('.zap-btn[data-amount]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const amount = parseInt(btn.dataset.amount, 10);
      btn.classList.add('zap-btn--loading');
      btn.disabled = true;

      await sendZap(amount, getMessage());

      btn.classList.remove('zap-btn--loading');
      btn.disabled = false;
      if (messageInput) messageInput.value = '';
    });
  });

  const customInput = document.getElementById('zap-custom-input');
  if (customInput) {
    customInput.addEventListener('input', () => {
      customInput.value = customInput.value.replace(/[^0-9]/g, '');
    });
  }

  const customBtn = document.getElementById('zap-custom-btn');
  if (customBtn && customInput) {
    customBtn.addEventListener('click', async () => {
      const amount = parseInt(customInput.value, 10);
      if (!amount || amount < 1) return;
      customBtn.classList.add('zap-btn--loading');
      customBtn.disabled = true;

      await sendZap(amount, getMessage());

      customBtn.classList.remove('zap-btn--loading');
      customBtn.disabled = false;
      customInput.value = '';
      if (messageInput) messageInput.value = '';
    });
  }
}
