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
import { loadStateGalleryDataUris } from './finalcostingPdfStateImages.js';
import { buildPdfFooterTemplate } from './finalcostingPdfSocial.js';
import Maker from '../models/maker.model.js';

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
  '--disable-translate',
  '--disable-sync',
  '--disable-hang-monitor',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-client-side-phishing-detection',
  '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
  '--run-all-compositor-stages-before-draw',
  '--disable-checker-imaging',
];

const IDLE_CLOSE_MS = 15 * 60 * 1000;
const PDF_TIMEOUT_MS = 60000;
const MAX_RENDER_ATTEMPTS = 2;

let browserInstance = null;
let idleTimer = null;
let launching = null;
/** Reused across queued PDF jobs (queue is serial). */
let pdfPage = null;

/** @type {Map<string, string>} brand -> data URI logo */
const logoDataUriByBrand = new Map();
const logosWarmingByBrand = new Map();

/** Prebuilt footer HTML per brand (avoid rebuilding every render). */
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
    pdfPage = null;
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
  pdfPage = null;
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
        pdfPage = null;
        scheduleIdleClose();
        b.on('disconnected', () => {
          if (browserInstance === b) {
            browserInstance = null;
            pdfPage = null;
          }
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

function injectLogoDataUri(html, brand) {
  const dataUri = logoDataUriByBrand.get(brand);
  if (!dataUri) return html;
  if (brand === 'demandsetu') {
    return html.split(DEMANDSETU_LOGO_URL).join(dataUri);
  }
  return html.split(PTW_LOGO_URL).join(dataUri);
}

async function getPdfPage() {
  const browser = await getBrowser();
  if (pdfPage) {
    try {
      if (typeof pdfPage.isClosed === 'function' ? !pdfPage.isClosed() : true) {
        return pdfPage;
      }
    } catch {
      pdfPage = null;
    }
  }
  const page = await browser.newPage();
  page.setDefaultTimeout(PDF_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PDF_TIMEOUT_MS);
  // PDF HTML is static — JS off speeds setContent + layout
  await page.setJavaScriptEnabled(false);
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  pdfPage = page;
  return page;
}

async function renderPdfBuffer(html, brand = 'ptw') {
  const page = await getPdfPage();
  try {
    // All assets are already inline data URIs — no network needed.
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
  } catch (err) {
    try {
      await pdfPage?.close();
    } catch {
      /* ignore */
    }
    pdfPage = null;
    throw err;
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
        await new Promise((r) => setTimeout(r, 250 * attempt));
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
      extraBeds: lead.extraBeds,
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
        itineraryDescription: clipText(it.itineraryDescription, 1000),
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
  const stateName = slim.package?.state || '';

  const tImages = Date.now();
  const [, stateGallery, makerDoc] = await Promise.all([
    Promise.all([getBrowser(), ensureBrandLogo(brand)]),
    loadStateGalleryDataUris(stateName, { budgetMs: 1200 }),
    fetchMakerForPdf(slim.userId, slim.package?.teamLeaderId),
  ]);
  const imagesMs = Date.now() - tImages;

  const maker = makerDoc || makerFromPackageFallback(slim.package);

  const enriched = {
    ...slim,
    pdfStateGallery: stateGallery,
    pdfMaker: maker,
    pdfBrand: brand,
  };

  const tHtml = Date.now();
  let html =
    brand === 'demandsetu'
      ? buildDemandSetuPdfHtml(enriched)
      : buildFinalCostingPdfHtml(enriched);
  html = injectLogoDataUri(html, brand);
  const htmlMs = Date.now() - tHtml;
  console.log(`[pdf] htmlBytes=${Buffer.byteLength(html, 'utf8')} hotels=${hotelCount}`);

  const tRender = Date.now();
  const buffer = await enqueuePdfJob(() => renderPdfBufferWithRetry(html, brand));
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
    getBrowser().then(() => getPdfPage()),
    ensureBrandLogo('ptw'),
    ensureBrandLogo('demandsetu'),
    loadStateGalleryDataUris('Himachal Pradesh', { budgetMs: 4000 }),
  ]);
}

export async function closePdfBrowser() {
  await resetBrowser();
}
