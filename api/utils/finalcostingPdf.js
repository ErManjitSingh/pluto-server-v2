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
];

const IDLE_CLOSE_MS = 8 * 60 * 1000;
const PDF_TIMEOUT_MS = 90000;

let browserInstance = null;
let idleTimer = null;
let launching = null;

/** @type {Map<string, string>} brand -> data URI logo */
const logoDataUriByBrand = new Map();
let logosWarming = null;

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

async function getBrowser() {
  if (browserInstance?.connected) {
    scheduleIdleClose();
    return browserInstance;
  }
  if (!launching) {
    launching = launchBrowser().then((b) => {
      browserInstance = b;
      launching = null;
      scheduleIdleClose();
      return b;
    });
  }
  return launching;
}

/** Warm logos as PNG base64 (no crop / no JPEG) so they look sharp in PDF. */
async function ensureLogosEmbedded() {
  if (logoDataUriByBrand.size >= 2) return;
  if (!logosWarming) {
    logosWarming = (async () => {
      const [ptw, ds] = await Promise.all([
        embedLogoAsDataUri(PTW_LOGO_URL, 360),
        embedLogoAsDataUri(DEMANDSETU_LOGO_URL, 360),
      ]);
      if (ptw) logoDataUriByBrand.set('ptw', ptw);
      if (ds) logoDataUriByBrand.set('demandsetu', ds);
      logosWarming = null;
    })().catch(() => {
      logosWarming = null;
    });
  }
  await logosWarming;
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

    // Block ALL remote images/fonts/media — everything needed is already base64 in HTML.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // domcontentloaded is much faster than 'load' (no network image wait).
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: PDF_TIMEOUT_MS,
    });
    await page.emulateMediaType('print');

    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
      timeout: PDF_TIMEOUT_MS,
    });

    return Buffer.from(pdfUint8);
  } finally {
    await page.close().catch(() => {});
    scheduleIdleClose();
  }
}

/**
 * @param {object} operation
 * @param {'ptw'|'demandsetu'} [brand='ptw']
 */
export async function generateFinalCostingPdfBuffer(operation, brand = 'ptw') {
  const cacheKey = buildPdfCacheKey(operation, brand);
  const cached = getCachedPdf(cacheKey);
  if (cached) return cached;

  // Warm browser + logos in parallel with hotel image compression
  const [, withImages] = await Promise.all([
    Promise.all([getBrowser(), ensureLogosEmbedded()]),
    attachOptimizedHotelImages(operation),
  ]);

  let html =
    brand === 'demandsetu'
      ? buildDemandSetuPdfHtml(withImages)
      : buildFinalCostingPdfHtml(withImages);

  html = injectLogoDataUri(html, brand);

  const buffer = await enqueuePdfJob(() => renderPdfBuffer(html));
  setCachedPdf(cacheKey, buffer);
  return buffer;
}

/** Call once on server boot to avoid cold-start delay on first PDF. */
export async function warmPdfEngine() {
  await Promise.all([getBrowser(), ensureLogosEmbedded()]);
}

export async function closePdfBrowser() {
  if (idleTimer) clearTimeout(idleTimer);
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
