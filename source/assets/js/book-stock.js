const BOOK_SALES_ENDPOINT = 'https://book-stats.hello-5b9.workers.dev/book-sales';

export async function fetchBookStock(regularInventory, promotionalCopies = 0) {
  const response = await fetch(BOOK_SALES_ENDPOINT, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Book sales request failed: ${response.status}`);

  const data = await response.json();
  const regularSales = Number(data.total ?? 0);
  return {
    available: Math.max(regularInventory - regularSales - promotionalCopies, 0),
    lastOrderDate: data.lastOrderDate,
  };
}

export async function updateBookStock() {
  const elements = [...document.querySelectorAll('[data-book-stock]')];
  if (!elements.length) return;

  const regularInventory = Number(elements[0].dataset.bookInventory);
  const promotionalCopies = Number(elements[0].dataset.bookPromotional ?? 0);
  if (!Number.isFinite(regularInventory) || !Number.isFinite(promotionalCopies)) return;

  try {
    const { available } = await fetchBookStock(regularInventory, promotionalCopies);
    elements.forEach((element) => { element.textContent = available; });
  } catch (error) {
    console.error('[book-stock]', error);
    elements.forEach((element) => { element.textContent = '—'; });
  }
}

updateBookStock();
