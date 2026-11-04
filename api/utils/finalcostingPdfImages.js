import sharp from 'sharp';

/** Tuned for PDF thumbs: small + fast, without starving real photos */
const FETCH_TIMEOUT_MS = 2200;
const OVERALL_BUDGET_MS = 3200;
const MAX_WIDTH = 140;
const JPEG_QUALITY = 45;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE = 160;
const CONCURRENCY = 8;
const MAX_UNIQUE_URLS = 14;

/** @type {Map<string, { dataUri: string|null, expires: number }>} */
const imageCache = new Map();

/** In-flight dedupe so the same URL is never fetched twice at once */
/** @type {Map<string, Promise<string|null>>} */
const inflight = new Map();

function pickUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    return /^https?:\/\//i.test(s) ? s : null;
  }
  if (typeof value === 'object') {
    return pickUrl(
      value.url ||
        value.src ||
        value.downloadURL ||
        value.secure_url ||
        value.image ||
        value.photo ||
        null
    );
  }
  return null;
}

/** Resolve hotel image URL from common final-costing shapes. */
export function getHotelImageUrl(hotel) {
  if (!hotel || typeof hotel !== 'object') return null;

  const arrays = [
    hotel.propertyphoto,
    hotel.propertyPhoto,
    hotel.propertyPhotos,
    hotel.photos,
    hotel.images,
    hotel.hotelImages,
  ];
  for (const arr of arrays) {
    if (Array.isArray(arr) && arr.length) {
      const u = pickUrl(arr[0]);
      if (u) return u;
    }
  }

  const singles = [
    hotel.roomimage,
    hotel.roomImage,
    hotel.image,
    hotel.photo,
    hotel.propertyImage,
    hotel.hotelImage,
    hotel.thumbnail,
    hotel.coverImage,
  ];
  for (const s of singles) {
    const u = pickUrl(s);
    if (u) return u;
  }

  return null;
}

function hotelCacheKey(url) {
  return `${url}|hotel|${MAX_WIDTH}|${JPEG_QUALITY}`;
}

function remember(cacheKey, dataUri, ttl = CACHE_TTL_MS) {
  if (imageCache.size >= MAX_CACHE) {
    const first = imageCache.keys().next().value;
    if (first) imageCache.delete(first);
  }
  imageCache.set(cacheKey, { dataUri, expires: Date.now() + ttl });
}

function getCached(cacheKey) {
  const cached = imageCache.get(cacheKey);
  if (!cached) return undefined;
  if (Date.now() > cached.expires) {
    imageCache.delete(cacheKey);
    return undefined;
  }
  return cached.dataUri;
}

async function fetchBuffer(url, timeoutMs, signal) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) throw new Error('aborted');
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; PlutoPDF/1.0)',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function compressOnce(
  url,
  timeoutMs,
  signal,
  maxWidth = MAX_WIDTH,
  quality = JPEG_QUALITY,
  height = 0,
  maxBytes = 6 * 1024 * 1024,
  deadline = 0
) {
  const raw = await fetchBuffer(url, timeoutMs, signal);
  if (signal?.aborted || (deadline && Date.now() > deadline)) {
    throw new Error('aborted');
  }
  if (!raw?.length || raw.length > maxBytes) {
    throw new Error('empty or too large');
  }
  const out = await sharp(raw, { failOn: 'none' })
    .rotate()
    .resize({
      width: maxWidth,
      height: height || Math.round(maxWidth * 0.7),
      fit: 'cover',
      withoutEnlargement: true,
    })
    .jpeg({ quality, progressive: false, optimizeScans: false })
    .toBuffer();

  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

/**
 * Download + resize + compress image to a small JPEG data URI.
 * Returns null on any failure (caller shows hotel icon).
 */
export async function compressImageToDataUri(url, opts = {}) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;

  const timeoutMs = opts.timeoutMs || FETCH_TIMEOUT_MS;
  const signal = opts.signal;
  const maxWidth = opts.maxWidth || MAX_WIDTH;
  const quality = opts.quality || JPEG_QUALITY;
  const height = Number(opts.height) || 0;
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 6 * 1024 * 1024;
  const deadline = Number(opts.deadline) || 0;
  const kind = opts.cacheKind || 'hotel';
  const cacheKey =
    kind === 'hotel' && maxWidth === MAX_WIDTH && quality === JPEG_QUALITY && !height
      ? hotelCacheKey(url)
      : `${url}|${kind}|${maxWidth}|${height}|${quality}`;

  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const job = (async () => {
    try {
      const dataUri = await compressOnce(
        url,
        timeoutMs,
        signal,
        maxWidth,
        quality,
        height,
        maxBytes,
        deadline
      );
      remember(cacheKey, dataUri, CACHE_TTL_MS);
      return dataUri;
    } catch {
      // Do NOT cache failures — avoid icon→photo glitch on next download
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, job);
  return job;
}

/**
 * Company logos: keep PNG, no crop, preserve aspect ratio + transparency.
 * @param {string} url
 * @param {number} [maxWidth=280]
 * @param {{ removeBlackBg?: boolean }} [opts]
 */
export async function embedLogoAsDataUri(url, maxWidth = 280, opts = {}) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;

  const removeBlackBg = opts.removeBlackBg === true;
  const cacheKey = `${url}|logo|png|${maxWidth}|nobg=${removeBlackBg ? 1 : 0}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  let dataUri = null;
  try {
    const raw = await fetchBuffer(url, 3500, null);
    if (!raw?.length || raw.length > 4 * 1024 * 1024) {
      throw new Error('empty or too large');
    }

    // Fast path only when we keep the file as-is (no black-bg strip).
    if (
      !removeBlackBg &&
      raw.length <= 80 * 1024 &&
      raw[0] === 0x89 &&
      raw[1] === 0x50
    ) {
      dataUri = `data:image/png;base64,${raw.toString('base64')}`;
    } else {
      let pipeline = sharp(raw, { failOn: 'none' })
        .rotate()
        .resize({
          width: maxWidth,
          height: Math.round(maxWidth * 0.65),
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha();

      if (removeBlackBg) {
        const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Near-black → transparent (logo plate / baked black bg)
          if (r <= 48 && g <= 48 && b <= 48) {
            data[i + 3] = 0;
          }
        }
        const out = await sharp(data, {
          raw: { width: info.width, height: info.height, channels: 4 },
        })
          .png({ compressionLevel: 6 })
          .toBuffer();
        dataUri = `data:image/png;base64,${out.toString('base64')}`;
      } else {
        const out = await pipeline.png({ compressionLevel: 6, palette: true }).toBuffer();
        dataUri = `data:image/png;base64,${out.toString('base64')}`;
      }
    }
    remember(cacheKey, dataUri, CACHE_TTL_MS);
  } catch {
    dataUri = null;
  }

  return dataUri;
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}

/**
 * Attach optimized `pdfImage` on each hotel.
 * - Parallel unique-URL fetch (capped)
 * - Hard overall budget so PDF never stalls on slow Firebase
 * - Success cache for instant repeat downloads
 * - Icon only when no URL / timeout / fail (stable for this request)
 */
export async function attachOptimizedHotelImages(operation, opts = {}) {
  if (!operation || typeof operation !== 'object') return operation;

  const hotels = Array.isArray(operation.hotels) ? operation.hotels : [];
  if (!hotels.length) return operation;

  const t0 = Date.now();
  const overallBudget =
    typeof opts.budgetMs === 'number' ? opts.budgetMs : OVERALL_BUDGET_MS;

  const urlSet = new Set();
  const hotelUrlMap = hotels.map((h) => {
    const u = getHotelImageUrl(h);
    if (u) urlSet.add(u);
    return u;
  });

  let urls = [...urlSet];
  if (urls.length > MAX_UNIQUE_URLS) {
    urls = urls.slice(0, MAX_UNIQUE_URLS);
  }

  const urlToData = new Map();
  const budgetCtrl = new AbortController();

  // Instant cache hits — zero wait
  const misses = [];
  for (const url of urls) {
    const hit = getCached(hotelCacheKey(url));
    if (hit !== undefined) {
      urlToData.set(url, hit);
    } else {
      misses.push(url);
    }
  }

  if (misses.length) {
    const budgetTimer = setTimeout(() => budgetCtrl.abort(), overallBudget);

    const fetchAll = mapPool(misses, CONCURRENCY, async (url) => {
      if (budgetCtrl.signal.aborted) {
        urlToData.set(url, null);
        return;
      }
      const dataUri = await compressImageToDataUri(url, {
        timeoutMs: FETCH_TIMEOUT_MS,
        signal: budgetCtrl.signal,
      });
      urlToData.set(url, dataUri);
    });

    await Promise.race([
      fetchAll,
      new Promise((resolve) => {
        const onAbort = () => resolve();
        if (budgetCtrl.signal.aborted) resolve();
        else budgetCtrl.signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);

    clearTimeout(budgetTimer);

    if (budgetCtrl.signal.aborted) {
      await new Promise((r) => setTimeout(r, 120));
    }

    for (const url of misses) {
      if (!urlToData.has(url)) urlToData.set(url, null);
    }
  }

  let withPhoto = 0;
  let withIcon = 0;
  const enrichedHotels = hotels.map((h, i) => {
    const url = hotelUrlMap[i];
    let pdfImage = null;
    if (url && urlToData.has(url)) {
      pdfImage = urlToData.get(url) || null;
    } else if (url) {
      pdfImage = null;
    }
    if (pdfImage) withPhoto += 1;
    else withIcon += 1;
    return { ...h, pdfImage };
  });

  console.log(
    `[pdf-image] ${Date.now() - t0}ms hotels=${hotels.length} urls=${urls.length} miss=${misses.length} photos=${withPhoto} icons=${withIcon} budget=${overallBudget}`
  );

  return { ...operation, hotels: enrichedHotels };
}

/** Cover gallery only — never let a long packageImages list bloat the PDF. */
const GALLERY_LIMIT = 4;
/** Photo is optional. Past this, PDF continues with whatever already finished. */
const GALLERY_BUDGET_MS = 1200;
const GALLERY_FETCH_MS = 1000;
/** Original Firebase files are multi-MB. Skip them instead of decoding during PDF. */
const GALLERY_MAX_BYTES = 450 * 1024;

/**
 * First N http(s) image URLs from package.packageImages (strings or {url}).
 * @param {unknown} packageImages
 * @param {number} [limit]
 * @returns {string[]}
 */
export function collectPackageImageUrls(packageImages, limit = GALLERY_LIMIT) {
  const list = Array.isArray(packageImages) ? packageImages : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const u = pickUrl(item);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

function galleryResize(count) {
  if (count <= 1) return { maxWidth: 640, height: 240, quality: 50 };
  if (count === 2) return { maxWidth: 420, height: 200, quality: 48 };
  if (count === 3) return { maxWidth: 320, height: 180, quality: 46 };
  return { maxWidth: 360, height: 180, quality: 46 };
}

/**
 * Best-effort package photos. Always resolves to an array (possibly empty).
 * Slow, huge, or failed downloads are skipped — they must not delay the PDF.
 * @returns {Promise<string[]>}
 */
export async function loadPackageGalleryDataUris(packageImages, opts = {}) {
  let urls = [];
  try {
    urls = collectPackageImageUrls(packageImages, GALLERY_LIMIT);
  } catch {
    return [];
  }
  if (!urls.length) return [];

  const budgetMs = typeof opts.budgetMs === 'number' ? opts.budgetMs : GALLERY_BUDGET_MS;
  const { maxWidth, height, quality } = galleryResize(urls.length);
  const t0 = Date.now();
  const deadline = t0 + budgetMs;
  const budgetCtrl = new AbortController();
  const results = new Array(urls.length).fill(null);
  const budgetTimer = setTimeout(() => budgetCtrl.abort(), budgetMs);

  const work = Promise.all(
    urls.map(async (url, i) => {
      if (budgetCtrl.signal.aborted || Date.now() > deadline) return;
      const uri = await compressImageToDataUri(url, {
        timeoutMs: Math.min(GALLERY_FETCH_MS, budgetMs),
        signal: budgetCtrl.signal,
        maxWidth,
        height,
        quality,
        cacheKind: 'pkg',
        maxBytes: GALLERY_MAX_BYTES,
        deadline,
      });
      if (!budgetCtrl.signal.aborted && Date.now() <= deadline && uri) {
        results[i] = uri;
      }
    })
  ).catch(() => {});

  await Promise.race([
    work,
    new Promise((resolve) => {
      if (budgetCtrl.signal.aborted) resolve();
      else budgetCtrl.signal.addEventListener('abort', () => resolve(), { once: true });
    }),
  ]);
  clearTimeout(budgetTimer);

  const ok = results.filter((uri) => typeof uri === 'string' && uri.startsWith('data:image/'));
  console.log(`[pdf-gallery] ${Date.now() - t0}ms urls=${urls.length} ok=${ok.length} budget=${budgetMs}`);
  return ok;
}
