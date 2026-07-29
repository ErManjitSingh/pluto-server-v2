/** Bump when PDF HTML/layout changes so cached PDFs refresh */
export const PDF_TEMPLATE_VERSION = 'v39';
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 80;

/** @type {Map<string, { buffer: Buffer, expires: number }>} */
const store = new Map();

/**
 * @param {object} operation
 * @param {string} [brand='ptw']
 */
export function buildPdfCacheKey(operation, brand = 'ptw') {
  const updated =
    operation.updatedAt instanceof Date
      ? operation.updatedAt.toISOString()
      : String(operation.updatedAt || '');
  return `${PDF_TEMPLATE_VERSION}|${brand}|${operation.id}|${operation.userId}|${operation.customerLeadId}|${updated}`;
}

export function getCachedPdf(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.buffer;
}

export function setCachedPdf(key, buffer) {
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  store.set(key, { buffer, expires: Date.now() + TTL_MS });
}
