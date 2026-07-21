import sharp from 'sharp';

const FETCH_TIMEOUT_MS = 3000;
const MAX_WIDTH = 220;
const JPEG_QUALITY = 55;
const CACHE_TTL_MS = 45 * 60 * 1000;
const MAX_CACHE = 100;

/** @type {Map<string, { dataUri: string|null, expires: number }>} */
const imageCache = new Map();

function getHotelImageUrl(hotel) {
  if (!hotel) return null;
  if (Array.isArray(hotel.propertyphoto) && hotel.propertyphoto[0]) {
    return String(hotel.propertyphoto[0]).trim() || null;
  }
  if (hotel.roomimage) return String(hotel.roomimage).trim() || null;
  return null;
}

async function fetchBuffer(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'image/*,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download + resize + compress image to a small JPEG data URI.
 * Returns null on any failure (caller shows hotel icon).
 */
export async function compressImageToDataUri(url, opts = {}) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;

  const width = opts.width || MAX_WIDTH;
  const quality = opts.quality || JPEG_QUALITY;
  const cacheKey = `${url}|hotel|${width}|${quality}`;

  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.dataUri;

  let dataUri = null;
  try {
    const raw = await fetchBuffer(url);
    if (!raw?.length || raw.length > 8 * 1024 * 1024) {
      throw new Error('empty or too large');
    }
    const out = await sharp(raw, { failOn: 'none' })
      .rotate()
      .resize({
        width,
        height: width,
        fit: 'cover',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    dataUri = `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    dataUri = null;
  }

  if (imageCache.size >= MAX_CACHE) {
    const first = imageCache.keys().next().value;
    if (first) imageCache.delete(first);
  }
  imageCache.set(cacheKey, { dataUri, expires: Date.now() + CACHE_TTL_MS });
  return dataUri;
}

/**
 * Company logos: keep PNG, no crop, preserve aspect ratio + transparency.
 * JPEG+cover was making logos look broken.
 */
export async function embedLogoAsDataUri(url, maxWidth = 320) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;

  const cacheKey = `${url}|logo|png|${maxWidth}`;
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.dataUri;

  let dataUri = null;
  try {
    const raw = await fetchBuffer(url);
    if (!raw?.length || raw.length > 4 * 1024 * 1024) {
      throw new Error('empty or too large');
    }

    // Prefer original PNG when already small enough
    if (raw.length <= 80 * 1024 && raw[0] === 0x89 && raw[1] === 0x50) {
      dataUri = `data:image/png;base64,${raw.toString('base64')}`;
    } else {
      const out = await sharp(raw, { failOn: 'none' })
        .rotate()
        .resize({
          width: maxWidth,
          height: Math.round(maxWidth * 0.6),
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 8, palette: true })
        .toBuffer();
      dataUri = `data:image/png;base64,${out.toString('base64')}`;
    }
  } catch {
    dataUri = null;
  }

  if (imageCache.size >= MAX_CACHE) {
    const first = imageCache.keys().next().value;
    if (first) imageCache.delete(first);
  }
  imageCache.set(cacheKey, { dataUri, expires: Date.now() + CACHE_TTL_MS });
  return dataUri;
}

/**
 * Attach optimized `pdfImage` (data URI or null) on each hotel.
 * Unique URLs are fetched once in parallel.
 */
export async function attachOptimizedHotelImages(operation) {
  if (!operation || typeof operation !== 'object') return operation;

  const hotels = Array.isArray(operation.hotels) ? operation.hotels : [];
  if (!hotels.length) return operation;

  const urlSet = new Set();
  hotels.forEach((h) => {
    const u = getHotelImageUrl(h);
    if (u) urlSet.add(u);
  });

  const urls = [...urlSet];
  const urlToData = new Map();

  // Limit concurrency to 4 — faster overall than hammering Firebase with 8+ at once
  const CONCURRENCY = 4;
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const chunk = urls.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (url) => {
        const dataUri = await compressImageToDataUri(url);
        urlToData.set(url, dataUri);
      })
    );
  }

  const enrichedHotels = hotels.map((h) => {
    const url = getHotelImageUrl(h);
    const pdfImage = url ? urlToData.get(url) || null : null;
    return { ...h, pdfImage };
  });

  return { ...operation, hotels: enrichedHotels };
}
