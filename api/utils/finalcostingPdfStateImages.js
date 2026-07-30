import { compressImageToDataUri } from './finalcostingPdfImages.js';

/** Destination photos keyed by package.state (3 per state). */
export const stateImages = {
  'Andhra Pradesh': [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  'Arunachal Pradesh': [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1544735716-392fe2489ffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
  ],
  Assam: [
    'https://images.pexels.com/photos/974429/pexels-photo-974429.jpeg',
    'https://images.pexels.com/photos/974406/pexels-photo-974406.jpeg',
    'https://images.pexels.com/photos/636303/pexels-photo-636303.jpeg',
  ],
  Bihar: [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  Chhattisgarh: [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  Goa: [
    'https://images.pexels.com/photos/4429333/pexels-photo-4429333.jpeg',
    'https://images.pexels.com/photos/14384530/pexels-photo-14384530.jpeg',
    'https://images.pexels.com/photos/12377224/pexels-photo-12377224.jpeg',
  ],
  Gujarat: [
    'https://media.istockphoto.com/id/171145722/photo/champaner-india.jpg?b=1&s=612x612&w=0&k=20&c=Ltu0y9L29SRtaTiJqNPujHydMnOVGt6ekqbAfHNgJuY=',
    'https://media.istockphoto.com/id/1340310484/photo/a-beautiful-gira-waterfall-in-rainy-day-in-waghai-saputara-gujarat-india.jpg?b=1&s=612x612&w=0&k=20&c=GF2oPSEg3sL6X0efZRcqgakbfg0eavx_nXn96zyp474=',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  Haryana: [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  'Himachal Pradesh': [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1544735716-392fe2489ffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  Jharkhand: [
    'https://images.pexels.com/photos/17971796/pexels-photo-17971796.jpeg',
    'https://images.pexels.com/photos/14708921/pexels-photo-14708921.jpeg',
    'https://images.pexels.com/photos/2903051/pexels-photo-2903051.jpeg',
  ],
  Karnataka: [
    'https://images.pexels.com/photos/1583244/pexels-photo-1583244.jpeg',
    'https://images.pexels.com/photos/34066521/pexels-photo-34066521.jpeg',
    'https://images.pexels.com/photos/34041530/pexels-photo-34041530.jpeg',
  ],
  Kerala: [
    'https://images.pexels.com/photos/962464/pexels-photo-962464.jpeg',
    'https://images.pexels.com/photos/2780309/pexels-photo-2780309.jpeg',
    'https://images.pexels.com/photos/1050604/pexels-photo-1050604.jpeg',
  ],
  'Madhya Pradesh': [
    'https://images.pexels.com/photos/599708/pexels-photo-599708.jpeg',
    'https://images.pexels.com/photos/28739334/pexels-photo-28739334.jpeg',
    'https://images.pexels.com/photos/34111386/pexels-photo-34111386.jpeg',
  ],
  Maharashtra: [
    'https://images.pexels.com/photos/18680881/pexels-photo-18680881.jpeg',
    'https://images.pexels.com/photos/2643760/pexels-photo-2643760.jpeg',
    'https://images.pexels.com/photos/34040526/pexels-photo-34040526.jpeg',
  ],
  Manipur: [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1544735716-392fe2489ffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  Meghalaya: [
    'https://images.pexels.com/photos/1403036/pexels-photo-1403036.jpeg',
    'https://images.pexels.com/photos/945548/pexels-photo-945548.jpeg',
    'https://images.pexels.com/photos/34017584/pexels-photo-34017584.jpeg',
  ],
  Mizoram: [
    'https://images.pexels.com/photos/18006896/pexels-photo-18006896.jpeg',
    'https://images.pexels.com/photos/19000373/pexels-photo-19000373.jpeg',
    'https://images.pexels.com/photos/9683089/pexels-photo-9683089.jpeg',
  ],
  Nagaland: [
    'https://images.pexels.com/photos/32060854/pexels-photo-32060854.jpeg',
    'https://images.pexels.com/photos/33014021/pexels-photo-33014021.jpeg',
    'https://images.pexels.com/photos/33604642/pexels-photo-33604642.jpeg',
  ],
  Odisha: [
    'https://images.pexels.com/photos/790195/pexels-photo-790195.jpeg',
    'https://images.pexels.com/photos/774442/pexels-photo-774442.jpeg',
    'https://images.pexels.com/photos/1579683/pexels-photo-1579683.jpeg',
  ],
  Punjab: [
    'https://images.pexels.com/photos/34046564/pexels-photo-34046564.jpeg',
    'https://images.pexels.com/photos/5458388/pexels-photo-5458388.jpeg',
    'https://images.pexels.com/photos/2383832/pexels-photo-2383832.jpeg',
  ],
  Rajasthan: [
    'https://images.pexels.com/photos/797824/pexels-photo-797824.jpeg',
    'https://images.pexels.com/photos/1588032/pexels-photo-1588032.jpeg',
    'https://images.pexels.com/photos/34086724/pexels-photo-34086724.jpeg',
  ],
  Sikkim: [
    'https://images.pexels.com/photos/3037435/pexels-photo-3037435.jpeg',
    'https://images.pexels.com/photos/3275010/pexels-photo-3275010.jpeg',
    'https://images.pexels.com/photos/679492/pexels-photo-679492.jpeg',
  ],
  'Tamil Nadu': [
    'https://images.pexels.com/photos/34071591/pexels-photo-34071591.jpeg',
    'https://images.pexels.com/photos/34116438/pexels-photo-34116438.jpeg',
    'https://images.pexels.com/photos/34064636/pexels-photo-34064636.jpeg',
  ],
  Telangana: [
    'https://images.pexels.com/photos/34071591/pexels-photo-34071591.jpeg',
    'https://images.pexels.com/photos/34116438/pexels-photo-34116438.jpeg',
    'https://images.pexels.com/photos/34064636/pexels-photo-34064636.jpeg',
  ],
  Tripura: [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1544735716-392fe2489ffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  'Uttar Pradesh': [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  Uttarakhand: [
    'https://images.pexels.com/photos/954646/pexels-photo-954646.jpeg',
    'https://images.pexels.com/photos/20035462/pexels-photo-20035462.jpeg',
    'https://images.pexels.com/photos/1315684/pexels-photo-1315684.jpeg',
  ],
  'West Bengal': [
    'https://images.pexels.com/photos/34065227/pexels-photo-34065227.jpeg',
    'https://images.pexels.com/photos/34037416/pexels-photo-34037416.jpeg',
    'https://images.pexels.com/photos/34103775/pexels-photo-34103775.jpeg',
  ],
  'Andaman and Nicobar Islands': [
    'https://images.pexels.com/photos/13362953/pexels-photo-13362953.jpeg',
    'https://images.pexels.com/photos/6757981/pexels-photo-6757981.jpeg',
    'https://images.pexels.com/photos/362690/pexels-photo-362690.jpeg',
  ],
  Chandigarh: [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  'Dadra and Nagar Haveli': [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  'Daman and Diu': [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  Delhi: [
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
  'Jammu and Kashmir': [
    'https://images.pexels.com/photos/10975803/pexels-photo-10975803.jpeg',
    'https://images.pexels.com/photos/26110235/pexels-photo-26110235.jpeg',
    'https://images.pexels.com/photos/3974036/pexels-photo-3974036.jpeg',
  ],
  Ladakh: [
    'https://images.pexels.com/photos/5204921/pexels-photo-5204921.jpeg',
    'https://images.pexels.com/photos/5204560/pexels-photo-5204560.jpeg',
    'https://images.pexels.com/photos/14095829/pexels-photo-14095829.jpeg',
  ],
  Lakshadweep: [
    'https://images.pexels.com/photos/21617942/pexels-photo-21617942.jpeg',
    'https://images.pexels.com/photos/17011361/pexels-photo-17011361.jpeg',
    'https://images.pexels.com/photos/14646476/pexels-photo-14646476.jpeg',
  ],
  Puducherry: [
    'https://images.pexels.com/photos/30276796/pexels-photo-30276796.jpeg',
    'https://images.pexels.com/photos/34047119/pexels-photo-34047119.jpeg',
    'https://images.pexels.com/photos/922046/pexels-photo-922046.jpeg',
  ],
  'Sri Lanka': [
    'https://images.pexels.com/photos/1005417/pexels-photo-1005417.jpeg',
    'https://images.pexels.com/photos/1047051/pexels-photo-1047051.jpeg',
    'https://images.pexels.com/photos/1998438/pexels-photo-1998438.jpeg',
  ],
  default: [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1544735716-392fe2489ffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
    'https://images.unsplash.com/photo-1587474260584-136574528ed5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  ],
};

function normalizeStateKey(state) {
  return String(state || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Resolve up to 3 image URLs for a package state (handles extra spaces / casing). */
export function getStateImageUrls(state) {
  const wanted = normalizeStateKey(state);
  if (!wanted) return stateImages.default.slice(0, 3);

  for (const [key, urls] of Object.entries(stateImages)) {
    if (key === 'default') continue;
    if (normalizeStateKey(key) === wanted) {
      return (urls || []).filter(Boolean).slice(0, 3);
    }
  }
  return stateImages.default.slice(0, 3);
}

const STATE_FETCH_TIMEOUT_MS = 4000;
const STATE_WIDTH = 320;
const STATE_QUALITY = 42;

async function compressOne(url) {
  if (!url) return null;
  try {
    // No shared AbortController — one slow image must not kill the other two.
    return await compressImageToDataUri(url, {
      timeoutMs: STATE_FETCH_TIMEOUT_MS,
      maxWidth: STATE_WIDTH,
      quality: STATE_QUALITY,
      cacheKind: 'state',
    });
  } catch {
    return null;
  }
}

/**
 * Compress 3 state gallery images to data URIs.
 * Reliable: unique URLs, no shared abort, fallback to default images, soft deadline.
 * @returns {Promise<string[]>} data URIs (aim for 3)
 */
export async function loadStateGalleryDataUris(state, opts = {}) {
  const softDeadlineMs =
    typeof opts.budgetMs === 'number' ? opts.budgetMs : 5500;
  const t0 = Date.now();

  const primary = getStateImageUrls(state);
  const defaults = getStateImageUrls('default');
  // Unique URLs, prefer primary then defaults to fill up to 3
  const queue = [];
  const seen = new Set();
  for (const u of [...primary, ...defaults]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    queue.push(u);
    if (queue.length >= 6) break; // a few extras for retries/fallback
  }

  const ok = [];
  // First wave: first 3 URLs in parallel
  const firstBatch = queue.slice(0, 3);
  const firstResults = await Promise.all(firstBatch.map(compressOne));
  for (const uri of firstResults) {
    if (uri) ok.push(uri);
  }

  // Fill missing slots from remaining URLs while under soft deadline
  let idx = 3;
  while (ok.length < 3 && idx < queue.length && Date.now() - t0 < softDeadlineMs) {
    const uri = await compressOne(queue[idx++]);
    if (uri) ok.push(uri);
  }

  // One retry pass on failures from first batch if still short
  if (ok.length < 3 && Date.now() - t0 < softDeadlineMs) {
    for (const url of firstBatch) {
      if (ok.length >= 3 || Date.now() - t0 >= softDeadlineMs) break;
      const uri = await compressOne(url);
      if (uri && !ok.includes(uri)) ok.push(uri);
    }
  }

  console.log(
    `[pdf-state] ${Date.now() - t0}ms state="${state || ''}" ok=${ok.length}/3 tried=${Math.min(idx, queue.length)}`
  );
  return ok.slice(0, 3);
}
