import puppeteer from 'puppeteer';
import { existsSync } from 'fs';
import { buildFinalCostingPdfHtml } from './finalcostingPdfTemplate.js';
import {
  buildDemandSetuPdfHtml,
  DEMANDSETU_LOGO_URL,
} from './finalcostingPdfDemandSetuTemplate.js';
import { enqueuePdfJob } from './finalcostingPdfQueue.js';
import { buildPdfCacheKey, getCachedPdf, setCachedPdf } from './finalcostingPdfCache.js';
import {
  attachOptimizedHotelImages,
  embedLogoAsDataUri,
} from './finalcostingPdfImages.js';

const PTW_LOGO_URL =
  'https://ptwholidays.in/_next/image?url=%2FPTW-Holidays-logo.png&w=256&q=75';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--mute-audio',
  '--no-first-run',
  '--font-render-hinting=none',
  '--disable-software-rasterizer',
];

const IDLE_CLOSE_MS = 15 * 60 * 1000;
const PDF_TIMEOUT_MS = 60000;
const MAX_RENDER_ATTEMPTS = 2;

let browserInstance = null;
let idleTimer = null;
let launching = null;

/** @type {Map<string, string>} brand -> data URI logo */
const logoDataUriByBrand = new Map();
const logosWarmingByBrand = new Map();

function systemChromePaths() {
  if (process.platform !== 'win32') return [];
  const local = process.env.LOCALAPPDATA;
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    local ? `${local}\\Google\\Chrome\\Application\\chrome.exe` : null,
  ].filter(Boolean);
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch {
        /* ignore */
      }
      browserInstance = null;
    }
  }, IDLE_CLOSE_MS);
}

async function launchBrowser() {
  const base = { headless: true, args: LAUNCH_ARGS };
  const bundled = puppeteer.executablePath?.();
  if (bundled && existsSync(bundled)) {
    return puppeteer.launch({ ...base, executablePath: bundled });
  }
  for (const executablePath of systemChromePaths()) {
    if (existsSync(executablePath)) {
      return puppeteer.launch({ ...base, executablePath });
    }
  }
  try {
    return await puppeteer.launch({ ...base, channel: 'chrome' });
  } catch {
    return puppeteer.launch(base);
  }
}

async function resetBrowser() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  launching = null;
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      /* ignore */
    }
    browserInstance = null;
  }
}

async function getBrowser() {
  if (browserInstance?.connected) {
    scheduleIdleClose();
    return browserInstance;
  }
  if (!launching) {
    launching = launchBrowser()
      .then((b) => {
        browserInstance = b;
        launching = null;
        scheduleIdleClose();
        b.on('disconnected', () => {
          if (browserInstance === b) browserInstance = null;
        });
        return b;
      })
      .catch((err) => {
        launching = null;
        throw err;
      });
  }
  return launching;
}

function logoUrlForBrand(brand) {
  return brand === 'demandsetu' ? DEMANDSETU_LOGO_URL : PTW_LOGO_URL;
}

/** Warm only the logo needed for this PDF (not both brands). */
async function ensureBrandLogo(brand) {
  if (logoDataUriByBrand.has(brand)) return;
  if (!logosWarmingByBrand.has(brand)) {
    const p = embedLogoAsDataUri(logoUrlForBrand(brand), 280)
      .then((uri) => {
        if (uri) logoDataUriByBrand.set(brand, uri);
        logosWarmingByBrand.delete(brand);
      })
      .catch(() => {
        logosWarmingByBrand.delete(brand);
      });
    logosWarmingByBrand.set(brand, p);
  }
  await logosWarmingByBrand.get(brand);
}

function injectLogoDataUri(html, brand) {
  const dataUri = logoDataUriByBrand.get(brand);
  if (!dataUri) return html;
  if (brand === 'demandsetu') {
    return html.split(DEMANDSETU_LOGO_URL).join(dataUri);
  }
  return html.split(PTW_LOGO_URL).join(dataUri);
}

async function renderPdfBuffer(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(PDF_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PDF_TIMEOUT_MS);

    // All assets are already inline data URIs — no network needed.
    // Skip request interception (it adds overhead on every setContent).
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: PDF_TIMEOUT_MS,
    });

    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
      timeout: PDF_TIMEOUT_MS,
    });

    return Buffer.from(pdfUint8);
  } finally {
    await page.close().catch(() => {});
    scheduleIdleClose();
  }
}

async function renderPdfBufferWithRetry(html) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    try {
      return await renderPdfBuffer(html);
    } catch (err) {
      lastError = err;
      console.error(
        `[pdf] render attempt ${attempt}/${MAX_RENDER_ATTEMPTS} failed:`,
        err?.message || err
      );
      await resetBrowser();
      if (attempt < MAX_RENDER_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
  }
  throw lastError;
}

function clipText(str, max = 900) {
  const s = String(str || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

/**
 * Drop heavy Mongo fields that are unused in PDF HTML.
 * Big 9D/8N ops otherwise make setContent/page.pdf very slow / timeout (browser shows fake CORS).
 */
function slimOperationForPdf(operation) {
  if (!operation || typeof operation !== 'object') return operation;

  const slimLead = (lead) => {
    if (!lead || typeof lead !== 'object') return lead;
    return {
      name: lead.name,
      mobile: lead.mobile,
      email: lead.email,
      travelDate: lead.travelDate,
      days: lead.days,
      noOfRooms: lead.noOfRooms,
    };
  };

  const hotels = (Array.isArray(operation.hotels) ? operation.hotels : []).map((h) => ({
    day: h.day,
    propertyName: h.propertyName,
    cityName: h.cityName,
    roomName: h.roomName,
    mealPlan: h.mealPlan,
    roomcount: h.roomcount,
    propertyphoto: h.propertyphoto,
    propertyPhoto: h.propertyPhoto,
    roomimage: h.roomimage,
    roomImage: h.roomImage,
    image: h.image,
    photo: h.photo,
    selectedLead: slimLead(h.selectedLead),
  }));

  const pkg = operation.package || {};
  const itinDays = (pkg.itineraryDays || operation.transfer?.itineraryDays || []).map((d) => {
    const it = d.selectedItinerary || {};
    return {
      day: d.day,
      selectedItinerary: {
        itineraryTitle: it.itineraryTitle,
        cityName: it.cityName,
        itineraryDescription: clipText(it.itineraryDescription, 1000),
      },
    };
  });

  const transferDetails = (operation.transfer?.details || []).map((d) => ({
    cabName: d.cabName,
    cabType: d.cabType,
    seatingCapacity: d.seatingCapacity,
    cabSeatingCapacity: d.cabSeatingCapacity,
    luggage: d.luggage,
    quantity: d.quantity,
  }));

  return {
    id: operation.id,
    _id: operation._id,
    userId: operation.userId,
    customerLeadId: operation.customerLeadId,
    updatedAt: operation.updatedAt,
    finalTotal: operation.finalTotal,
    total: operation.total,
    totals: operation.totals
      ? { grandTotal: operation.totals.grandTotal }
      : undefined,
    hotels,
    package: {
      packageName: pkg.packageName,
      state: pkg.state,
      duration: pkg.duration,
      packageType: pkg.packageType,
      tags: pkg.tags,
      pickupLocation: pkg.pickupLocation,
      dropLocation: pkg.dropLocation,
      packagePlaces: pkg.packagePlaces,
      packageDescription: pkg.packageDescription,
      packageInclusions: pkg.packageInclusions,
      packageExclusions: pkg.packageExclusions,
      customExclusions: (pkg.customExclusions || []).map((p) => ({
        name: p.name,
        description: p.description,
      })),
      itineraryDays: itinDays,
    },
    transfer: {
      selectedLead: slimLead(operation.transfer?.selectedLead),
      details: transferDetails,
      itineraryDays: pkg.itineraryDays?.length ? undefined : itinDays,
    },
  };
}

/**
 * @param {object} operation
 * @param {'ptw'|'demandsetu'} [brand='ptw']
 * @returns {Promise<{ buffer: Buffer, cacheHit: boolean, timings?: object }>}
 */
export async function generateFinalCostingPdfBuffer(operation, brand = 'ptw') {
  const t0 = Date.now();
  const slim = slimOperationForPdf(operation);
  const cacheKey = buildPdfCacheKey(slim, brand);
  const cached = getCachedPdf(cacheKey);
  if (cached) {
    return { buffer: cached, cacheHit: true, timings: { totalMs: Date.now() - t0, cacheHit: true } };
  }

  const hotelCount = slim.hotels?.length || 0;
  // Large trips: shorter image wait so render starts sooner (icons for slow ones)
  const imageBudgetMs = hotelCount >= 7 ? 2200 : 3200;

  const tImages = Date.now();
  const [, withImages] = await Promise.all([
    Promise.all([getBrowser(), ensureBrandLogo(brand)]),
    attachOptimizedHotelImages(slim, { budgetMs: imageBudgetMs }),
  ]);
  const imagesMs = Date.now() - tImages;

  const tHtml = Date.now();
  let html =
    brand === 'demandsetu'
      ? buildDemandSetuPdfHtml(withImages)
      : buildFinalCostingPdfHtml(withImages);
  html = injectLogoDataUri(html, brand);
  const htmlMs = Date.now() - tHtml;
  console.log(`[pdf] htmlBytes=${Buffer.byteLength(html, 'utf8')} hotels=${hotelCount}`);

  const tRender = Date.now();
  const buffer = await enqueuePdfJob(() => renderPdfBufferWithRetry(html));
  const renderMs = Date.now() - tRender;

  setCachedPdf(cacheKey, buffer);

  const timings = {
    cacheHit: false,
    imagesMs,
    htmlMs,
    renderMs,
    totalMs: Date.now() - t0,
  };
  console.log(
    `[pdf] ${brand} generated in ${timings.totalMs}ms (images=${imagesMs} html=${htmlMs} render=${renderMs})`
  );

  return { buffer, cacheHit: false, timings };
}

/** Call once on server boot to avoid cold-start delay on first PDF. */
export async function warmPdfEngine() {
  await Promise.all([
    getBrowser(),
    ensureBrandLogo('ptw'),
    ensureBrandLogo('demandsetu'),
  ]);
}

export async function closePdfBrowser() {
  await resetBrowser();
}
