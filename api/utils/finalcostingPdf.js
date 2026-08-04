import puppeteer from 'puppeteer';
import { existsSync } from 'fs';
import { buildFinalCostingPdfHtml } from './finalcostingPdfTemplate.js';
import {
  buildDemandSetuPdfHtml,
  DEMANDSETU_LOGO_URL,
} from './finalcostingPdfDemandSetuTemplate.js';
import { enqueuePdfJob } from './finalcostingPdfQueue.js';
import { buildPdfCacheKey, getCachedPdf, setCachedPdf } from './finalcostingPdfCache.js';
import { embedLogoAsDataUri } from './finalcostingPdfImages.js';
import { buildPdfFooterTemplate } from './finalcostingPdfSocial.js';
import Maker from '../models/maker.model.js';

const PTW_LOGO_URL =
  'https://ptwholidays.in/_next/image?url=%2FPTW-Holidays-logo.png&w=256&q=75';

/** Keep in sync with finalcostingPdfTemplate.js — must be inlined (never fetched by Chrome). */
export const PTW_BANK_SCANNER_URL =
  'https://res.cloudinary.com/dcp1ev1uk/image/upload/v1785405723/world_darshan_scanner_mqjwsk.png';

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
  '--disable-translate',
  '--disable-sync',
  '--disable-hang-monitor',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-client-side-phishing-detection',
  '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
  '--run-all-compositor-stages-before-draw',
  '--disable-checker-imaging',
  '--renderer-process-limit=1',
];

const IDLE_CLOSE_MS = 20 * 60 * 1000;
/** Per Chrome render attempt — must finish before Cloudflare ~60s proxy cut. */
const PDF_TIMEOUT_MS = 25000;
const MAX_RENDER_ATTEMPTS = 2;
/** Whole generate (DB already done) including queue wait + retries. */
const OVERALL_BUDGET_MS = 55000;
const QUEUE_JOB_TIMEOUT_MS = 50000;

let browserInstance = null;
let idleTimer = null;
let launching = null;

/** @type {Map<string, string>} */
const logoDataUriByBrand = new Map();
/** @type {Map<string, Promise<void>>} */
const logosWarmingByBrand = new Map();

/** @type {string|null} */
let bankScannerDataUri = null;
/** @type {Promise<void>|null} */
let bankScannerWarming = null;

const footerTemplateByBrand = {
  ptw: null,
  demandsetu: null,
};

function getFooterTemplate(brand) {
  const key = brand === 'demandsetu' ? 'demandsetu' : 'ptw';
  if (!footerTemplateByBrand[key]) {
    footerTemplateByBrand[key] = buildPdfFooterTemplate(key);
  }
  return footerTemplateByBrand[key];
}

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

function withBudget(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function launchBrowser() {
  const base = {
    headless: true,
    args: LAUNCH_ARGS,
    protocolTimeout: QUEUE_JOB_TIMEOUT_MS,
  };
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

async function ensureBrandLogo(brand) {
  if (logoDataUriByBrand.has(brand)) return;
  if (!logosWarmingByBrand.has(brand)) {
    const isDemand = brand === 'demandsetu';
    const p = embedLogoAsDataUri(logoUrlForBrand(brand), isDemand ? 640 : 280, {
      removeBlackBg: isDemand,
    })
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

async function ensureBankScanner() {
  if (bankScannerDataUri) return;
  if (!bankScannerWarming) {
    bankScannerWarming = embedLogoAsDataUri(PTW_BANK_SCANNER_URL, 220)
      .then((uri) => {
        if (uri) bankScannerDataUri = uri;
        bankScannerWarming = null;
      })
      .catch(() => {
        bankScannerWarming = null;
      });
  }
  await bankScannerWarming;
}

function injectAssets(html, brand) {
  const logoUri = logoDataUriByBrand.get(brand);
  if (logoUri) {
    html =
      brand === 'demandsetu'
        ? html.split(DEMANDSETU_LOGO_URL).join(logoUri)
        : html.split(PTW_LOGO_URL).join(logoUri);
  }
  if (brand !== 'demandsetu' && bankScannerDataUri) {
    html = html.split(PTW_BANK_SCANNER_URL).join(bankScannerDataUri);
  }
  return html;
}

/**
 * Fresh page every job. Block ALL remote URLs so Chrome never waits on logo/QR network
 * (that hang stuck the serial queue → every PDF then looked like CORS).
 */
async function renderPdfBuffer(html, brand = 'ptw') {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(PDF_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PDF_TIMEOUT_MS);
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (u.startsWith('data:') || u.startsWith('about:')) {
        req.continue().catch(() => {});
      } else {
        req.abort('blockedbyclient').catch(() => {});
      }
    });

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: PDF_TIMEOUT_MS,
    });

    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: getFooterTemplate(brand),
      margin: { top: '10mm', right: '10mm', bottom: '18mm', left: '10mm' },
      timeout: PDF_TIMEOUT_MS,
    });

    scheduleIdleClose();
    return Buffer.from(pdfUint8);
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
  }
}

async function renderPdfBufferWithRetry(html, brand = 'ptw') {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    try {
      return await renderPdfBuffer(html, brand);
    } catch (err) {
      lastError = err;
      console.error(
        `[pdf] render attempt ${attempt}/${MAX_RENDER_ATTEMPTS} failed:`,
        err?.message || err
      );
      await resetBrowser();
      if (attempt < MAX_RENDER_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }
  throw lastError;
}

async function fetchMakerForPdf(userId, teamLeaderId) {
  const ids = [...new Set([userId, teamLeaderId].filter(Boolean).map(String))];
  for (const id of ids) {
    try {
      const maker = await Maker.findById(id)
        .select('firstName lastName designation email contactNo companyName')
        .lean()
        .maxTimeMS(2500);
      if (maker) {
        console.log(`[pdf] maker hit id=${id} name=${maker.firstName || ''} ${maker.lastName || ''}`);
        return maker;
      }
    } catch (err) {
      console.error(`[pdf] maker fetch failed id=${id}:`, err?.message || err);
    }
  }
  console.log(`[pdf] maker miss ids=${ids.join(',') || '(none)'}`);
  return null;
}

function makerFromPackageFallback(pkg = {}) {
  const name = String(pkg.teamLeader || '').trim();
  if (!name) return null;
  const parts = name.split(/\s+/);
  return {
    firstName: parts[0] || name,
    lastName: parts.slice(1).join(' '),
    designation: 'Travel Executive',
    companyName: '',
    email: '',
    contactNo: '',
  };
}

function clipText(str, max = 900) {
  const s = String(str || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

/**
 * Drop heavy Mongo fields unused in PDF HTML.
 * selectedHotel alone is ~50–440KB per day and is duplicated under package + transfer.
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
      extraBeds: lead.extraBeds,
    };
  };

  // Template uses SVG icons only — never hotel photos
  const hotels = (Array.isArray(operation.hotels) ? operation.hotels : []).map((h) => ({
    day: h.day,
    propertyName: h.propertyName,
    cityName: h.cityName,
    roomName: h.roomName,
    mealPlan: h.mealPlan,
    roomcount: h.roomcount,
    selectedLead: slimLead(h.selectedLead),
  }));

  const slimCityArea = (areas) =>
    (Array.isArray(areas) ? areas : [])
      .filter((a) => a && (a.placeName || a.description))
      .map((a) => ({
        placeName: a.placeName,
        description: clipText(a.description, 400),
      }));

  const slimSimilarHotels = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((h) => h && h.propertyName)
      .slice(0, 6)
      .map((h) => ({
        propertyName: h.propertyName,
        rating: h.rating,
      }));

  const pkg = operation.package || {};
  const itinDays = (pkg.itineraryDays || operation.transfer?.itineraryDays || []).map((d) => {
    const it = d.selectedItinerary || {};
    return {
      day: d.day,
      similarhotel: slimSimilarHotels(d.similarhotel),
      selectedItinerary: {
        itineraryTitle: it.itineraryTitle,
        cityName: it.cityName,
        itineraryDescription: clipText(it.itineraryDescription, 800),
        cityArea: slimCityArea(it.cityArea),
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
    createdAt: operation.createdAt,
    finalTotal: operation.finalTotal,
    total: operation.total,
    discountPercentage: operation.discountPercentage,
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
      teamLeader: pkg.teamLeader,
      teamLeaderId: pkg.teamLeaderId,
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

  const run = async () => {
    const tPrep = Date.now();
    const warmAssets =
      brand === 'demandsetu'
        ? Promise.all([getBrowser(), ensureBrandLogo(brand)])
        : Promise.all([getBrowser(), ensureBrandLogo(brand), ensureBankScanner()]);

    const [, makerDoc] = await Promise.all([
      warmAssets,
      fetchMakerForPdf(slim.userId, slim.package?.teamLeaderId),
    ]);
    const prepMs = Date.now() - tPrep;

    const maker = makerDoc || makerFromPackageFallback(slim.package);
    const enriched = { ...slim, pdfMaker: maker, pdfBrand: brand };

    const tHtml = Date.now();
    let html =
      brand === 'demandsetu'
        ? buildDemandSetuPdfHtml(enriched)
        : buildFinalCostingPdfHtml(enriched);
    html = injectAssets(html, brand);
    const htmlMs = Date.now() - tHtml;
    console.log(`[pdf] htmlBytes=${Buffer.byteLength(html, 'utf8')} hotels=${hotelCount}`);

    const tRender = Date.now();
    const buffer = await enqueuePdfJob(
      () => renderPdfBufferWithRetry(html, brand),
      { timeoutMs: QUEUE_JOB_TIMEOUT_MS }
    );
    const renderMs = Date.now() - tRender;

    setCachedPdf(cacheKey, buffer);

    const timings = {
      cacheHit: false,
      prepMs,
      htmlMs,
      renderMs,
      totalMs: Date.now() - t0,
    };
    console.log(
      `[pdf] ${brand} generated in ${timings.totalMs}ms (prep=${prepMs} html=${htmlMs} render=${renderMs})`
    );
    return { buffer, cacheHit: false, timings };
  };

  try {
    return await withBudget(run(), OVERALL_BUDGET_MS, 'PDF generation');
  } catch (err) {
    // Hung Chrome must not poison later downloads
    await resetBrowser().catch(() => {});
    throw err;
  }
}

export async function warmPdfEngine() {
  await Promise.all([
    getBrowser(),
    ensureBrandLogo('ptw'),
    ensureBrandLogo('demandsetu'),
    ensureBankScanner(),
  ]);
}

export async function closePdfBrowser() {
  await resetBrowser();
}
