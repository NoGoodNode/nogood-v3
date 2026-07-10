const SNIPCART_API = 'https://app.snipcart.com/api';
const PRODUCT_IDS = ['book-collectors-edition', 'book-regular-edition', 'collectors-edition'];

export default {
  async fetch(request, env) {
    if (!env.SNIPCART_SECRET_KEY) {
      return new Response('Server misconfigured', { status: 500 });
    }

    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        }
      });
    }

    if (url.pathname === '/book-sales' && request.method === 'GET') {
      return handleBookSales(env);
    }

    if (url.pathname === '/print-sales' && request.method === 'GET') {
      return handlePrintSales(env);
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handlePrintSales(env) {
  const auth = btoa(`${env.SNIPCART_SECRET_KEY}:`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
  };

  try {
    const product = await fetch(`${SNIPCART_API}/products/book-regular-edition-print`, { headers })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);

    const total = product?.statistics?.numberOfSales ?? 0;

    return new Response(JSON.stringify({ total }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Could not fetch stats' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

async function handleBookSales(env) {
  const auth = btoa(`${env.SNIPCART_SECRET_KEY}:`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
  };

  try {
    const [salesResults, ordersResult] = await Promise.all([
      Promise.all(
        PRODUCT_IDS.map(id =>
          fetch(`${SNIPCART_API}/products/${id}`, { headers })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      ),
      fetch(`${SNIPCART_API}/orders?limit=50&status=Processed`, { headers })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    ]);

    const total = salesResults.reduce((sum, p) => sum + (p?.statistics?.numberOfSales ?? 0), 0);

    let lastOrderDate = null;
    if (ordersResult?.items) {
      const match = ordersResult.items.find(order =>
        order.items?.some(item => PRODUCT_IDS.includes(item.id))
      );
      if (match) lastOrderDate = match.completionDate ?? match.creationDate ?? null;
    }

    return new Response(JSON.stringify({ total, lastOrderDate }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Could not fetch stats' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
