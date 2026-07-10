const BTCPAY_URL = 'https://btcpay.nogood.tech';
const BTCPAY_STORE_ID = '4wuMXYAM4p28uMdfT8pwTfUCWyY8cvAbimE3XL6bTWYA';
const SNIPCART_API = 'https://payment.snipcart.com/api';
const MAX_BODY_BYTES = 8192;
const VALID_HEX = /^[0-9a-f]+$/i;

export default {
  async fetch(request, env) {
    if (!env.BTCPAY_API_KEY || !env.BTCPAY_WEBHOOK_SECRET || !env.RATE_LIMIT_KV || !env.SNIPCART_GATEWAY_API_KEY) {
      return new Response('Server misconfigured', { status: 500 });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') return corsResponse();

    if (pathname === '/gateway' && request.method === 'POST') {
      return handleGateway(request, env);
    }

    if (pathname === '/checkout' && request.method === 'GET') {
      return handleCheckout(request, env, url);
    }

    if (pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (pathname === '/health' && request.method === 'GET') {
      return handleHealth(env);
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handleHealth(env) {
  try {
    const resp = await fetch(`${BTCPAY_URL}/api/v1/health`, {
      headers: { 'Authorization': `token ${env.BTCPAY_API_KEY}` }
    });
    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch {
    return new Response(JSON.stringify({ synchronized: false }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function handleGateway(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(ip, env.RATE_LIMIT_KV))) {
    return gatewayError('Too many requests', 429);
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return gatewayError('Invalid request', 400);
    body = JSON.parse(text);
  } catch {
    return gatewayError('Invalid request', 400);
  }

  const publicToken = body.PublicToken || body.publicToken;
  if (!publicToken || typeof publicToken !== 'string') {
    return gatewayError('Invalid token', 400);
  }

  try {
    const validateRes = await fetch(
      `${SNIPCART_API}/public/custom-payment-gateway/validate?publicToken=${encodeURIComponent(publicToken)}`
    );
    if (!validateRes.ok) return gatewayError('Unauthorized', 401);
  } catch {
    return gatewayError('Could not validate request', 502);
  }

  return new Response(JSON.stringify([{
    id: 'btcpay',
    name: 'Bitcoin / Lightning',
    checkoutUrl: 'https://btcpay.hello-5b9.workers.dev/checkout'
  }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleCheckout(request, env, url) {
  const publicToken = url.searchParams.get('publicToken');
  if (!publicToken || typeof publicToken !== 'string') {
    return new Response('Invalid request', { status: 400 });
  }

  try {
    const validateRes = await fetch(
      `${SNIPCART_API}/public/custom-payment-gateway/validate?publicToken=${encodeURIComponent(publicToken)}`
    );
    if (!validateRes.ok) return new Response('Unauthorized', { status: 401 });
  } catch {
    return new Response('Could not validate request', { status: 502 });
  }

  let paymentSession;
  try {
    const sessionRes = await fetch(
      `${SNIPCART_API}/public/custom-payment-gateway/payment-session?publicToken=${encodeURIComponent(publicToken)}`
    );
    if (!sessionRes.ok) return new Response('Session not found', { status: 404 });
    paymentSession = await sessionRes.json();
  } catch {
    return new Response('Could not fetch payment session', { status: 502 });
  }

  const paymentSessionId = paymentSession.id;
  const amount = paymentSession.invoice?.amount;
  const currency = paymentSession.invoice?.currency?.toUpperCase();
  const redirectUrl = paymentSession.paymentAuthorizationRedirectUrl || 'https://nogood.tech/shop';

  if (!paymentSessionId || typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    return new Response('Invalid payment session', { status: 400 });
  }

  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    return new Response('Invalid currency', { status: 400 });
  }

  try {
    const searchRes = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices?orderId=${encodeURIComponent(publicToken)}&status=New&status=Processing`,
      { headers: { 'Authorization': `token ${env.BTCPAY_API_KEY}` } }
    );
    if (searchRes.ok) {
      const existing = await searchRes.json();
      if (Array.isArray(existing) && existing.length > 0 && existing[0].checkoutLink) {
        return Response.redirect(existing[0].checkoutLink, 302);
      }
    }
  } catch {
    // Non-fatal — fall through to create new invoice
  }

  let invoice;
  try {
    const invoiceRes = await fetch(`${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${env.BTCPAY_API_KEY}`
      },
      body: JSON.stringify({
        amount,
        currency,
        orderId: publicToken,
        checkout: {
          redirectURL: redirectUrl,
          redirectAutomatically: true
        },
        metadata: {
          publicToken,
          paymentSessionId
        }
      })
    });
    if (!invoiceRes.ok) return new Response('Payment provider error', { status: 502 });
    invoice = await invoiceRes.json();
  } catch {
    return new Response('Payment provider error', { status: 502 });
  }

  if (!invoice.id || !invoice.checkoutLink) {
    return new Response('Payment provider error', { status: 502 });
  }

  return Response.redirect(invoice.checkoutLink, 302);
}

async function handleWebhook(request, env) {
  let text;
  try {
    text = await request.text();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (text.length > MAX_BODY_BYTES) {
    return new Response('Bad request', { status: 400 });
  }

  const signature = request.headers.get('BTCPay-Sig');
  if (!signature || !signature.startsWith('sha256=')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sigHex = signature.slice(7);
  if (!VALID_HEX.test(sigHex) || sigHex.length % 2 !== 0) {
    return new Response('Unauthorized', { status: 401 });
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.BTCPAY_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(sigHex),
    new TextEncoder().encode(text)
  );

  if (!valid) return new Response('Unauthorized', { status: 401 });

  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { publicToken, paymentSessionId } = event.metadata || {};
  const invoiceId = event.invoiceId;

  if (publicToken && paymentSessionId && invoiceId) {
    if (event.type === 'InvoiceSettled') {
      await confirmSnipcartPayment(paymentSessionId, 'processed', invoiceId, env);
    } else if (event.type === 'InvoiceExpired' || event.type === 'InvoiceInvalid') {
      await confirmSnipcartPayment(paymentSessionId, 'failed', invoiceId, env);
    }
  }

  return new Response('OK', { status: 200 });
}

async function confirmSnipcartPayment(paymentSessionId, state, transactionId, env) {
  try {
    const res = await fetch(`${SNIPCART_API}/private/custom-payment-gateway/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SNIPCART_GATEWAY_API_KEY}`
      },
      body: JSON.stringify({
        paymentSessionId,
        state,
        transactionId
      })
    });
    if (!res.ok) {
      console.error(`Snipcart payment confirmation failed: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error(`Snipcart payment confirmation error:`, e.message);
  }
}

async function checkRateLimit(ip, kv) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate:${ip}:${minute}`;
  const count = parseInt(await kv.get(key) || '0');
  if (count >= 10) return false;
  await kv.put(key, String(count + 1), { expirationTtl: 120 });
  return true;
}

function gatewayError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://nogood.tech',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
