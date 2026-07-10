// nogood-display Worker
// Requires a KV namespace bound as ORDERS in wrangler.toml:
//   [[kv_namespaces]]
//   binding = "ORDERS"
//   id = "<your-kv-namespace-id>"
//
// Snipcart webhook URL: https://<your-worker>.workers.dev/webhook
// Set this in Snipcart dashboard → Account → Webhooks

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env, cors);
    }

    if (url.pathname === '/latest-order' && request.method === 'GET') {
      return handleLatestOrder(env, cors);
    }

    if (url.pathname === '/debug-webhook' && request.method === 'GET') {
      const raw = await env.ORDERS.get('debug');
      return new Response(raw || 'null', {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handleWebhook(request, env, cors) {
  try {
    const body = await request.json();

    if (body.eventName !== 'order.completed') {
      return new Response('OK', { status: 200, headers: cors });
    }

    const order = body.content;
    await env.ORDERS.put('debug', JSON.stringify(order));
    const items = (order.items || []).map(i => i.name).filter(Boolean);
    const buyer = order.billingAddress?.fullName || order.email || 'Anonymous';
    const amount = order.total != null
      ? `${order.currency || ''} ${parseFloat(order.total).toFixed(2)}`.trim()
      : '—';
    const payment = order.paymentGatewayUsed || order.paymentMethod || '—';

    await env.ORDERS.put('latest', JSON.stringify({
      items,
      buyer,
      orderId: order.token,
      amount,
      payment,
      timestamp: Date.now(),
    }));

    return new Response('OK', { status: 200, headers: cors });
  } catch {
    return new Response('Error', { status: 500, headers: cors });
  }
}

async function handleLatestOrder(env, cors) {
  const data = await env.ORDERS.get('latest');
  return new Response(data || 'null', {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
