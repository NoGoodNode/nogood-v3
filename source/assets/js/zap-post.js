import QRCode from '/assets/js/vendor/qrcode.js';

const RECIPIENT_PUBKEY = '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185';
const ZAP_LUD16 = 'nogood@getalby.com';
const RELAYS = ['wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.getalby.com/v1'];

let weblnEnabled = false;

async function sendZap(amountSats) {
  const statusEl = document.getElementById('zap-status');
  const setStatus = (msg, type = '') => {
    statusEl.textContent = msg;
    statusEl.className = 'zap-status' + (type ? ` zap-status--${type}` : '');
  };

  try {
    setStatus('Resolving lightning address...');
    function withTimeout(promise, ms) {
      return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]);
    }
    async function fetchLnurl(lud16) {
      const [username, domain] = lud16.split('@');
      const res = await fetch(`https://${domain}/.well-known/lnurlp/${username}`).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json();
      return data.callback ? data : null;
    }
    const lnurlData = await withTimeout(fetchLnurl(ZAP_LUD16), 3000);
    if (!lnurlData) { setStatus('Could not reach lightning service', 'error'); return; }

    const amountMsats = amountSats * 1000;
    setStatus('Getting invoice...');

    let zapRequestEvent = null;
    if (lnurlData.allowsNostr && lnurlData.nostrPubkey && window.nostr) {
      try {
        zapRequestEvent = await window.nostr.signEvent({
          kind: 9734,
          created_at: Math.floor(Date.now() / 1000),
          content: zapTitle || '',
          tags: [
            ['relays', ...RELAYS],
            ['amount', amountMsats.toString()],
            ['p', RECIPIENT_PUBKEY],
          ],
        });
      } catch { zapRequestEvent = null; }
    }

    async function fetchInvoice(data) {
      const url = new URL(data.callback);
      url.searchParams.set('amount', amountMsats.toString());
      if (zapRequestEvent) url.searchParams.set('nostr', JSON.stringify(zapRequestEvent));
      const res = await fetch(url.toString()).catch(() => null);
      if (!res || !res.ok) return null;
      const body = await res.json();
      return body.pr ? body : null;
    }

    const invoiceData = await withTimeout(fetchInvoice(lnurlData), 3000);
    if (!invoiceData) { setStatus('Could not get invoice', 'error'); return; }

    if (window.webln) {
      try {
        if (!weblnEnabled) { await window.webln.enable(); weblnEnabled = true; }
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
    showInvoiceModal(invoiceData.pr, amountSats);
  } catch (err) {
    setStatus('Zap failed — try again', 'error');
    setTimeout(() => setStatus(''), 4000);
  }
}

function showInvoiceModal(invoice, amountSats) {
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
    width: 200, margin: 0,
    color: { dark: '#000', light: '#fff' },
  });

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

  function close() {
    modal.hidden = true;
    cleanup();
  }

  function cleanup() {
    copyBtn.removeEventListener('click', handleCopy);
    closeBtn.removeEventListener('click', close);
    backdrop.removeEventListener('click', close);
  }

  copyBtn.addEventListener('click', handleCopy);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  modal.hidden = false;
}

const zapTitle = document.querySelector('.button-group[data-zap-title]')?.dataset.zapTitle || '';

document.querySelectorAll('.zap-btn[data-amount]').forEach(btn => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await sendZap(parseInt(btn.dataset.amount, 10));
    btn.disabled = false;
  });
});
