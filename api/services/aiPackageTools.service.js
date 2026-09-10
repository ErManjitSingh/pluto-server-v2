import mongoose from 'mongoose';
import Add from '../models/add.model.js';
import Itinerary from '../models/itenary.model.js';
import GlobalMaster from '../models/globalmaster.model.js';
import Cabs from '../models/cabs.model.js';
import { createAdd } from '../controllers/add.controller.js';
import { runController } from '../utils/runController.js';
import {
  buildDaySkeleton,
  buildTravelInfo,
  computeFinalCosting,
  embedCab,
  formatDuration,
  lowestCabPrices,
  normalizeLocation,
  normalizeTitle,
  packagePlacesFrom,
  planWarnings,
  stripTitleNoise,
  totalNightsOf,
} from './packageDraft.service.js';

const ITINERARY_LIMIT = 10;
const CANDIDATE_LIMIT = 6;
/**
 * Candidates must be ranked before they are trimmed. A city like Dharamshala has
 * 40+ local-sightseeing itineraries and the exact title match can sit anywhere in
 * that list, so a wide pool is pulled first and cut only after scoring.
 */
const CANDIDATE_POOL = 60;
const NOISE_WORDS = /\b(arrival|arrive|departure|depart|drop|transfer|airport|railway|volvo|overnight)\b/i;
const PACKAGE_LIMIT = 12;
const DESCRIPTION_PREVIEW = 220;
const STANDARD_POLICY_NAMES = [
  'Inclusion',
  'Exclusions',
  'Payment Policy',
  'Cancellation Policy',
  'Refund Policy',
  'Points to Note',
];

const READ_ONLY_TOOLS = new Set([
  'search_itineraries',
  'get_itinerary',
  'get_globalmaster',
  'search_cabs',
  'search_packages',
  'get_package',
  'plan_package_days',
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pick(obj, fields) {
  const out = {};
  for (const key of fields) {
    if (obj?.[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function definedFields(obj = {}) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

function routeFingerprint({ pickupLocation, dropLocation, places } = {}) {
  const pickup = normalizeTitle(pickupLocation);
  const drop = normalizeTitle(dropLocation || pickupLocation);
  const route = packagePlacesFrom(places)
    .map((p) => `${normalizeTitle(p.placeCover)}:${Number(p.nights) || 0}`)
    .join('|');
  return `${pickup}>${route}>${drop}`;
}

/**
 * cityName casing is inconsistent in the data ("delhi" but "Manali"), and
 * some values carry stray whitespace, so every lookup is anchored + insensitive.
 */
function looseExact(value) {
  return { $regex: `^\\s*${escapeRegex(normalizeLocation(value))}\\s*$`, $options: 'i' };
}

function contains(value) {
  return { $regex: escapeRegex(normalizeLocation(value)), $options: 'i' };
}

function truncate(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** GlobalMaster descriptions are editor HTML. Never send raw HTML to the model. */
function htmlToPoints(html) {
  const text = String(html ?? '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(li|p|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/[ \t]+/g, ' ');

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const LIST_ITEM_RE = /<li\b[^>]*>[\s\S]*?<\/li>/gi;

function stripTags(html) {
  return htmlToPoints(html).join(' ').trim();
}

/**
 * Points are read from the <li> elements themselves so that the numbering the
 * user sees is the same numbering used when removing a point later.
 */
export function policyPoints(html) {
  const items = String(html ?? '').match(LIST_ITEM_RE);
  if (items?.length) return items.map(stripTags).filter(Boolean);
  return htmlToPoints(html);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Edits are applied at <li> level only: a point is dropped whole, or a new one
 * is appended reusing the first item's opening tag. Nothing rewrites the markup
 * inside a point, so the stored formatting cannot be corrupted. A reword is
 * therefore expressed as a remove plus an add.
 */
export function applyPolicyEdits(html, { removeIndices = [], addPoints = [] } = {}) {
  const raw = String(html ?? '');
  const items = raw.match(LIST_ITEM_RE);
  if (!items?.length) return raw;

  const remove = new Set((removeIndices || []).map(Number).filter((n) => Number.isFinite(n)));
  const openTag = (items[0].match(/^<li\b[^>]*>/i) || ['<li>'])[0];

  const kept = items.filter((_, i) => !remove.has(i + 1));
  const added = (addPoints || [])
    .map((point) => String(point ?? '').trim())
    .filter(Boolean)
    .map((point) => `${openTag}${escapeHtml(point)}</li>`);

  const merged = [...kept, ...added];
  if (!merged.length) return '';

  let seen = 0;
  return raw.replace(LIST_ITEM_RE, () => {
    const replacement = seen === 0 ? merged.join('') : '';
    seen += 1;
    return replacement;
  });
}

/**
 * Where each GlobalMaster entry lands on a package.
 * Verified against live data: "Inclusion" and "Exclusions" fill the two
 * package-level fields; every other entry becomes a customExclusions block.
 */
export function globalMasterSlot(name) {
  const key = normalizeTitle(name);
  if (key === 'inclusion' || key === 'inclusions') return 'packageInclusions';
  if (key === 'exclusion' || key === 'exclusions') return 'packageExclusions';
  return 'customExclusions';
}

function isOptionalPolicy(name) {
  return normalizeTitle(name).includes('honeymoon');
}

function canonicalPolicyName(name) {
  const key = normalizeTitle(name);
  if (key === 'inclusion' || key === 'inclusions') return 'Inclusion';
  if (key === 'exclusion' || key === 'exclusions') return 'Exclusions';
  if (key.includes('payment')) return 'Payment Policy';
  if (key.includes('cancellation')) return 'Cancellation Policy';
  if (key.includes('refund')) return 'Refund Policy';
  if (key.includes('points to note') || key === 'notes') return 'Points to Note';
  return normalizeLocation(name);
}

// ---------------------------------------------------------------- previews

function itineraryCandidate(doc) {
  return {
    id: String(doc._id),
    itineraryTitle: doc.itineraryTitle,
    itineraryType: doc.itineraryType,
    cityName: doc.cityName,
    ...(doc.totalHours ? { totalHours: doc.totalHours } : {}),
    ...(doc.distance ? { distance: doc.distance } : {}),
  };
}

function itineraryPreview(doc) {
  return {
    ...itineraryCandidate(doc),
    country: doc.country,
    ...(Array.isArray(doc.cityArea) && doc.cityArea.length ? { cityArea: doc.cityArea } : {}),
    ...(doc.connectingCity ? { connectingCity: doc.connectingCity } : {}),
    status: doc.status,
    descriptionPreview: truncate(doc.itineraryDescription, DESCRIPTION_PREVIEW),
  };
}

const PACKAGE_PROJECTION = {
  'package.packageName': 1,
  'package.duration': 1,
  'package.state': 1,
  'package.status': 1,
  'package.packageType': 1,
  'package.packageCategory': 1,
  'package.pickupLocation': 1,
  'package.dropLocation': 1,
  'package.packagePlaces': 1,
  'package.themes': 1,
  'package.tags': 1,
  'package.hotelCategory': 1,
  'package.itineraryDays': 1,
  'cabs.travelPrices': 1,
  finalCosting: 1,
  createdAt: 1,
  updatedAt: 1,
};

function packagePreview(doc) {
  const pkg = doc?.package || {};
  const travel = doc?.cabs?.travelPrices || {};

  const cabs = [];
  for (const [cabType, list] of Object.entries(travel.selectedCabs || {})) {
    for (const cab of Array.isArray(list) ? list : []) {
      cabs.push({
        cabType,
        cabName: cab?.cabName,
        seatingCapacity: cab?.seatingCapacity,
        onSeasonPrice: cab?.prices?.onSeasonPrice,
        offSeasonPrice: cab?.prices?.offSeasonPrice,
      });
    }
  }

  return {
    id: String(doc._id),
    packageName: pkg.packageName,
    duration: pkg.duration,
    state: pkg.state,
    status: pkg.status,
    packageType: pkg.packageType,
    pickupLocation: normalizeLocation(pkg.pickupLocation),
    dropLocation: normalizeLocation(pkg.dropLocation),
    packagePlaces: pkg.packagePlaces,
    ...(pkg.themes?.length ? { themes: pkg.themes } : {}),
    ...(pkg.tags?.length ? { tags: pkg.tags } : {}),
    days: (pkg.itineraryDays || []).map((d) => ({
      day: d?.day,
      title: d?.selectedItinerary?.itineraryTitle,
      city: d?.selectedItinerary?.cityName,
    })),
    ...(cabs.length ? { cabs } : {}),
    ...(doc.finalCosting
      ? {
          finalCosting: pick(doc.finalCosting, ['baseTotal', 'margins', 'finalPrices']),
        }
      : {}),
    createdAt: doc.createdAt,
  };
}

// ---------------------------------------------------------------- read tools

async function searchItineraries(args = {}) {
  const filter = {};
  if (args.status) filter.status = args.status;
  else filter.status = 'enabled';

  if (args.cityName) filter.cityName = looseExact(args.cityName);
  if (args.country) filter.country = looseExact(args.country);
  if (args.itineraryType) filter.itineraryType = looseExact(args.itineraryType);
  if (args.titleContains) filter.itineraryTitle = contains(args.titleContains);

  if (!args.cityName && !args.titleContains) {
    return {
      ok: false,
      message:
        'Pass at least cityName or titleContains. There are over 5000 itineraries, so an unfiltered list is not allowed.',
    };
  }

  const limit = Math.min(ITINERARY_LIMIT, Math.max(1, Number(args.limit) || ITINERARY_LIMIT));
  const [total, rows] = await Promise.all([
    Itinerary.countDocuments(filter),
    Itinerary.find(filter)
      .select('itineraryTitle itineraryType cityName country cityArea connectingCity totalHours distance status itineraryDescription')
      .sort({ itineraryTitle: 1 })
      .limit(limit)
      .lean(),
  ]);

  return {
    ok: true,
    total,
    shown: rows.length,
    itineraries: rows.map(itineraryPreview),
    ...(total > rows.length
      ? { note: `${total} matches, showing ${rows.length}. Narrow with itineraryType or titleContains.` }
      : {}),
  };
}

async function getItinerary(args = {}) {
  const id = String(args.id || '').trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, message: 'id must be a valid itinerary id from search_itineraries' };
  }
  const doc = await Itinerary.findById(id).lean();
  if (!doc) return { ok: false, message: 'Itinerary not found' };

  return {
    ok: true,
    itinerary: {
      ...itineraryPreview(doc),
      itineraryDescription: doc.itineraryDescription,
      ...(doc.specialNotes ? { specialNotes: doc.specialNotes } : {}),
    },
  };
}

async function getGlobalMaster(args = {}, currentDraft) {
  const current = plainDraft(currentDraft);
  if ((current?.policies || []).length && !args.forceReselect) {
    return {
      ok: true,
      alreadyChosen: true,
      message:
        'Policies are already saved on the draft. Do not list or ask them again. Only change a point if the user asked to edit one.',
      policies: current.policies,
    };
  }

  const filter = {};
  const names = Array.isArray(args.names) ? args.names.filter(Boolean) : [];
  if (names.length) {
    filter.$or = names.map((n) => ({ name: looseExact(n) }));
  }

  const rows = await GlobalMaster.find(filter).sort({ name: 1 }).lean();
  if (!rows.length) {
    return { ok: false, message: names.length ? 'No GlobalMaster entry with that name' : 'GlobalMaster is empty' };
  }

  const entries = rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    slot: globalMasterSlot(row.name),
    ...(isOptionalPolicy(row.name) ? { optional: true } : {}),
    points: args.namesOnly ? undefined : policyPoints(row.description),
  }));

  return {
    ok: true,
    total: entries.length,
    entries,
    slotRule:
      'Inclusion -> package.packageInclusions, Exclusions -> package.packageExclusions, everything else -> package.customExclusions[]. Entries marked optional are only used when the user asks for them.',
    editRule:
      'Show the points to the user numbered from 1 and ask them to confirm. To change a block, save it in the draft with removeIndices (1-based, matching the numbers shown) and addPoints. A reword is a remove plus an add. Never retype a whole block.',
  };
}

async function searchCabs(args = {}, currentDraft) {
  const current = plainDraft(currentDraft);
  const locked = (current?.cabs || []).filter((c) => c.cabId || c.cabName);
  if (locked.length && !args.forceReselect && !args.query) {
    return {
      ok: true,
      alreadyChosen: true,
      message:
        'A cab is already saved on the draft. Do not tell the user it is unavailable and do not list cabs again. Only ask if onSeasonPrice or offSeasonPrice is missing.',
      cabs: locked,
      availableCabTypes: await Cabs.distinct('cabType'),
      cabsByType: {},
      cabOptions: current.cabOptions || [],
    };
  }  const filter = {};
  if (args.cabType) filter.cabType = looseExact(args.cabType);
  if (args.query) filter.cabName = contains(args.query);
  if (args.seatingCapacity) filter.cabSeatingCapacity = contains(args.seatingCapacity);

  const rows = await Cabs.find(filter).select('cabType cabName cabSeatingCapacity cabLuggage').lean();

  const grouped = {};
  for (const row of rows) {
    const type = row.cabType || 'Unknown';
    grouped[type] = grouped[type] || [];
    grouped[type].push({
      cabId: String(row._id),
      cabName: row.cabName,
      seatingCapacity: row.cabSeatingCapacity,
      luggage: row.cabLuggage,
    });
  }

  const allTypes = await Cabs.distinct('cabType');
  const cabOptions = flattenCabOptions(grouped);

  return {
    ok: true,
    total: rows.length,
    availableCabTypes: allTypes,
    cabsByType: grouped,
    cabOptions,
    priceRule:
      'The Cabs collection stores no price. Always ask the user for onSeasonPrice and offSeasonPrice for each selected cab. Never guess a price. If a cab is already LOCKED in the draft, do not list cabs again — only ask for any missing price.',
  };
}

function addIdFilter(id) {
  const raw = String(id || '').trim();
  const ids = [raw];
  if (isHexObjectId(raw)) ids.push(new mongoose.Types.ObjectId(raw));
  return { _id: { $in: ids } };
}

/** mongoose.isValidObjectId("Swift Dzire") can be true; only 24-hex is a real id. */
function isHexObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
}

function mixedIds(idList = []) {
  const out = [];
  for (const id of idList) {
    const raw = String(id || '').trim();
    if (!raw) continue;
    out.push(raw);
    if (isHexObjectId(raw)) out.push(new mongoose.Types.ObjectId(raw));
  }
  return out;
}

async function findByAnyIds(Model, idList) {
  const ids = mixedIds(idList);
  if (!ids.length) return [];
  return Model.find({ _id: { $in: ids } }).lean();
}

function flattenCabOptions(grouped = {}) {
  const out = [];
  for (const [cabType, list] of Object.entries(grouped)) {
    for (const cab of Array.isArray(list) ? list : []) {
      out.push({
        cabId: String(cab.cabId || cab._id || ''),
        cabName: cab.cabName || '',
        cabType: cab.cabType || cabType,
        seatingCapacity: cab.seatingCapacity || cab.cabSeatingCapacity || '',
      });
    }
  }
  return out;
}

function choiceToIndex(raw, length) {
  if (raw == null || String(raw).trim() === '') return null;
  const words = { first: 1, pehla: 1, pehli: 1, second: 2, dusra: 2, third: 3, tisra: 3 };
  const n = words[String(raw).trim().toLowerCase()] || Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > length) return null;
  return n;
}

function matchCabOption(options = [], incoming = {}) {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) return null;

  const index = choiceToIndex(
    incoming.choiceIndex ?? incoming.choice ?? incoming.option,
    list.length
  );
  if (index) return list[index - 1];

  const id = String(incoming.cabId || '').trim();
  if (isHexObjectId(id)) {
    const byId = list.find((c) => String(c.cabId) === id);
    if (byId) return byId;
  }

  const name = String(incoming.cabName || (!isHexObjectId(id) ? id : '') || '').trim();
  if (!name) return null;
  const want = normalizeTitle(name);
  const exact = list.filter((c) => normalizeTitle(c.cabName) === want);
  if (exact.length === 1) return exact[0];
  const partial = list.filter(
    (c) => normalizeTitle(c.cabName).includes(want) || want.includes(normalizeTitle(c.cabName))
  );
  if (partial.length === 1) return partial[0];
  return null;
}

async function findCabDocument(incoming = {}, options = []) {
  const fromOpt = matchCabOption(options, incoming);
  if (fromOpt?.cabId) {
    const docs = await findByAnyIds(Cabs, [fromOpt.cabId]);
    if (docs[0]) return docs[0];
    return {
      _id: fromOpt.cabId,
      cabName: fromOpt.cabName,
      cabType: fromOpt.cabType,
      cabSeatingCapacity: fromOpt.seatingCapacity,
    };
  }

  const id = String(incoming.cabId || '').trim();
  if (isHexObjectId(id)) {
    const docs = await findByAnyIds(Cabs, [id]);
    if (docs[0]) return docs[0];
  }

  const name = String(incoming.cabName || (!isHexObjectId(id) ? id : '') || '').trim();
  if (!name) return null;

  const exact = await Cabs.find({ cabName: looseExact(name) }).lean();
  if (exact.length === 1) return exact[0];
  const fuzzy = await Cabs.find({ cabName: contains(name) }).limit(8).lean();
  if (fuzzy.length === 1) return fuzzy[0];
  return null;
}

async function resolveIncomingCabs(incomingCabs, currentDraft) {
  const current = plainDraft(currentDraft);
  const options = current?.cabOptions || [];
  const existing = current?.cabs || [];

  if (!Array.isArray(incomingCabs) || !incomingCabs.length) return existing;

  // Prices-only update against the already locked cab.
  const onlyPrices = incomingCabs.length === 1
    && !incomingCabs[0].cabId
    && !incomingCabs[0].cabName
    && incomingCabs[0].choiceIndex == null
    && incomingCabs[0].choice == null
    && (incomingCabs[0].onSeasonPrice || incomingCabs[0].offSeasonPrice);
  if (onlyPrices && existing.length === 1) {
    const priceOn = String(incomingCabs[0].onSeasonPrice ?? existing[0].onSeasonPrice ?? '').trim();
    return [{
      ...existing[0],
      onSeasonPrice: priceOn,
      offSeasonPrice: String(incomingCabs[0].offSeasonPrice ?? existing[0].offSeasonPrice ?? priceOn).trim(),
    }];
  }

  const resolved = [];
  for (const incoming of incomingCabs) {
    const doc = await findCabDocument(incoming, options);
    if (!doc) continue;
    const prev = existing.find((c) => String(c.cabId) === String(doc._id));
    const onSeasonPrice = String(incoming.onSeasonPrice ?? prev?.onSeasonPrice ?? '').trim();
    const offSeasonPrice = String(
      incoming.offSeasonPrice ?? prev?.offSeasonPrice ?? onSeasonPrice
    ).trim();
    resolved.push({
      cabId: String(doc._id),
      cabName: doc.cabName || '',
      cabType: doc.cabType || '',
      onSeasonPrice,
      offSeasonPrice,
    });
  }
  return resolved.length ? resolved : existing;
}

async function searchPackages(args = {}) {
  const and = [];
  if (args.packageName) and.push({ 'package.packageName': contains(args.packageName) });
  if (args.state) and.push({ 'package.state': looseExact(args.state) });
  if (args.duration) and.push({ 'package.duration': looseExact(args.duration) });
  if (args.status) and.push({ 'package.status': looseExact(args.status) });
  if (args.packageType) and.push({ 'package.packageType': looseExact(args.packageType) });
  if (args.pickupLocation) and.push({ 'package.pickupLocation': looseExact(args.pickupLocation) });
  if (args.dropLocation) and.push({ 'package.dropLocation': looseExact(args.dropLocation) });
  if (args.place) {
    and.push({
      'package.packagePlaces': { $elemMatch: { placeCover: looseExact(args.place) } },
    });
  }

  if (!and.length) {
    return { ok: false, message: 'Pass at least one filter, for example packageName, state, duration or place.' };
  }

  const filter = { $and: and };
  const total = await Add.countDocuments(filter);
  if (args.countOnly) return { ok: true, total, packages: [] };

  const rows = await Add.find(filter, PACKAGE_PROJECTION)
    .sort({ createdAt: -1 })
    .limit(PACKAGE_LIMIT)
    .lean();

  return {
    ok: true,
    total,
    shown: rows.length,
    packages: rows.map(packagePreview),
  };
}

async function getPackage(args = {}) {
  const raw = String(args.id || '').trim();
  if (!raw) return { ok: false, message: 'id is required' };

  const doc = await Add.findOne(addIdFilter(raw)).lean();
  if (!doc) return { ok: false, message: 'Package not found' };

  const pkg = doc.package || {};
  return {
    ok: true,
    package: {
      ...packagePreview(doc),
      days: (pkg.itineraryDays || []).map((d) => ({
        day: d?.day,
        title: d?.selectedItinerary?.itineraryTitle,
        city: d?.selectedItinerary?.cityName,
        descriptionPreview: truncate(d?.selectedItinerary?.itineraryDescription, DESCRIPTION_PREVIEW),
      })),
      inclusions: policyPoints(pkg.packageInclusions),
      exclusions: policyPoints(pkg.packageExclusions),
      customExclusions: (pkg.customExclusions || []).map((c) => ({
        name: c?.name,
        points: policyPoints(c?.description),
      })),
      travelInfo: doc?.cabs?.travelPrices?.travelInfo,
    },
  };
}

// ------------------------------------------------------- day planning tool

/** Higher is a better fit for the day being planned. */
export function scoreCandidate(candidate, day) {
  const title = normalizeTitle(candidate.itineraryTitle);
  const expected = normalizeTitle(day.expectedTitle);
  const core = stripTitleNoise(candidate.itineraryTitle);
  const expectedCore = stripTitleNoise(day.expectedTitle);

  let score = 0;
  if (title === expected) score = 100;
  else if (core === expectedCore) score = 90;
  else if (day.purpose === 'local') {
    const city = normalizeTitle(day.city);
    if (title.startsWith(city) && /local/.test(title) && /sightseeing/.test(title)) score = 80;
    else if (/local/.test(title) && /sightseeing/.test(title)) score = 70;
    else if (title.startsWith(city)) score = 60;
    else score = 40;
  } else {
    const from = normalizeTitle(day.from);
    const to = normalizeTitle(day.to);
    if (title.startsWith(from) && title.includes(to)) score = 75;
    else if (title.includes(from) && title.includes(to)) score = 65;
    else score = 40;
  }

  // A pure local day should not reuse an arrival/drop itinerary.
  if (day.purpose === 'local' && NOISE_WORDS.test(candidate.itineraryTitle) && score < 100) score -= 25;
  // Between equally-matching titles, the shorter one is the more generic option.
  score -= Math.min(9, Math.floor(title.length / 20));
  return score;
}

/**
 * Auto-pick only when the choice is not a real question for the user.
 * Several candidates sharing one title are indistinguishable in chat, so the
 * first is taken and the duplication is reported instead of being asked about.
 * Different titles always go back to the user.
 */
export function tieredPick(candidates, day) {
  const expectedTitle = typeof day === 'string' ? day : day.expectedTitle;
  const context = typeof day === 'string' ? { expectedTitle, purpose: 'transfer' } : day;
  const expected = normalizeTitle(expectedTitle);
  const expectedCore = stripTitleNoise(expectedTitle);

  if (!candidates.length) return { pick: null, reason: null, note: null };

  // A second or later local day must be a different activity, never a repeat.
  const forceAsk = context.purpose === 'local' && Number(context.localIndex) >= 2;

  const distinctTitles = (list) => new Set(list.map((c) => normalizeTitle(c.itineraryTitle))).size;

  const exact = candidates.filter((c) => normalizeTitle(c.itineraryTitle) === expected);
  if (exact.length && !forceAsk) {
    return {
      pick: exact[0],
      reason: 'exact title match',
      note: exact.length > 1 ? `${exact.length} itineraries share this exact title; the first was used.` : null,
    };
  }

  const core = candidates.filter((c) => stripTitleNoise(c.itineraryTitle) === expectedCore);
  if (core.length && distinctTitles(core) === 1 && !forceAsk) {
    return {
      pick: core[0],
      reason: 'title matches after removing decoration',
      note: core.length > 1 ? `${core.length} itineraries share this title; the first was used.` : null,
    };
  }

  if (candidates.length === 1 && !forceAsk) {
    return { pick: candidates[0], reason: 'only candidate', note: null };
  }

  return { pick: null, reason: null, note: null };
}

async function candidatesForDay(day, usedIds, usedTitles) {
  const excluded = [...usedIds]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const base = {
    status: 'enabled',
    itineraryType: day.itineraryType,
    ...(excluded.length ? { _id: { $nin: excluded } } : {}),
  };
  const select = 'itineraryTitle itineraryType cityName totalHours distance';

  const attempts = [];
  if (day.purpose === 'local') {
    attempts.push({
      ...base,
      cityName: looseExact(day.city),
      itineraryTitle: { $regex: '(local|sightseeing)', $options: 'i' },
    });
    attempts.push({ ...base, cityName: looseExact(day.city) });
  } else {
    // Travel itineraries are filed under the destination city and titled "From to To".
    const chain = {
      $regex: `${escapeRegex(normalizeLocation(day.from))}[\\s\\S]*${escapeRegex(normalizeLocation(day.to))}`,
      $options: 'i',
    };
    attempts.push({ ...base, cityName: looseExact(day.to), itineraryTitle: chain });
    attempts.push({ ...base, itineraryTitle: chain });
    attempts.push({ ...base, cityName: looseExact(day.to) });
  }

  for (const filter of attempts) {
    const rows = await Itinerary.find(filter).select(select).limit(CANDIDATE_POOL).lean();
    if (!rows.length) continue;

    const ranked = rows
      .map(itineraryCandidate)
      .filter((c) => !usedTitles.has(normalizeTitle(c.itineraryTitle)))
      .map((c) => ({ candidate: c, score: scoreCandidate(c, day) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.candidate);

    if (ranked.length) return ranked.slice(0, CANDIDATE_LIMIT);
  }
  return [];
}

async function planPackageDays(args = {}) {
  const pickupLocation = normalizeLocation(args.pickupLocation);
  const dropLocation = normalizeLocation(args.dropLocation) || pickupLocation;
  const places = packagePlacesFrom(args.places);

  if (!pickupLocation) {
    return { ok: false, message: 'pickupLocation is required. Ask the user where the tour starts.' };
  }
  if (!places.length) {
    return {
      ok: false,
      message:
        'places is required, for example [{"placeCover":"Manali","nights":2},{"placeCover":"Dharamshala","nights":1}].',
    };
  }

  const nights = totalNightsOf(places);
  const skeleton = buildDaySkeleton({ pickupLocation, dropLocation, places });
  const warnings = planWarnings({ places, duration: args.duration });

  const usedIds = new Set();
  const usedTitles = new Set();
  const days = [];
  for (const day of skeleton) {
    const candidates = await candidatesForDay(day, usedIds, usedTitles);
    const { pick: chosen, reason, note } = tieredPick(candidates, day);
    if (chosen) {
      usedIds.add(chosen.id);
      usedTitles.add(normalizeTitle(chosen.itineraryTitle));
    }
    if (!candidates.length) {
      warnings.push(`Day ${day.day}: no itinerary found for "${day.expectedTitle}". Ask the user how to handle this day.`);
    }
    if (note) warnings.push(`Day ${day.day}: ${note}`);
    days.push({
      day: day.day,
      purpose: day.purpose,
      itineraryType: day.itineraryType,
      city: day.city,
      ...(day.purpose === 'local' ? {} : { from: day.from, to: day.to }),
      expectedTitle: day.expectedTitle,
      suggested: chosen ? { ...chosen, why: reason } : null,
      needsChoice: !chosen,
      candidates,
    });
  }

  const costing = args.cabOnSeasonPrice
    ? computeFinalCosting({ transportCost: args.cabOnSeasonPrice })
    : null;

  return {
    ok: true,
    packageName: args.packageName || null,
    pickupLocation,
    dropLocation,
    packagePlaces: places,
    totalNights: nights,
    derivedDuration: formatDuration(nights),
    totalDays: skeleton.length,
    days,
    travelInfo: buildTravelInfo({ pickupLocation, dropLocation, places }),
    ...(costing ? { costingPreview: costing } : {}),
    warnings,
    nextSteps: [
      'Confirm every day where needsChoice is true by showing the candidate titles, then save the choice with update_package_draft.',
      'Call get_globalmaster and ask the user to confirm or edit inclusions, exclusions and policies, then save them.',
      'Ask the cabType, then call search_cabs, then ask the on-season and off-season price and save the cab.',
      'Ask for state and packageType if not known yet, then call create_package.',
    ],
  };
}

/** The plan is written straight into the draft so it survives history trimming. */
async function planAndSaveDraft(args = {}, currentDraft) {
  const current = plainDraft(currentDraft);
  const incomingPlaces = packagePlacesFrom(args.places);
  const incomingRoute = routeFingerprint({
    pickupLocation: args.pickupLocation,
    dropLocation: args.dropLocation || args.pickupLocation,
    places: incomingPlaces.length ? incomingPlaces : current?.places,
  });
  const existingRoute = current ? routeFingerprint(current) : '';

  // Re-planning the same route was wiping Day 1 after the user had already chosen it.
  if (current?.days?.length && existingRoute && existingRoute === incomingRoute) {
    const pending = (current.days || []).filter((day) => !day.itineraryId);
    return {
      kind: 'draft',
      draft: current,
      data: {
        ok: true,
        reusedDraft: true,
        message: pending.length
          ? `Day plan already saved. Do not re-ask LOCKED days. Only ask for day ${pending.map((d) => d.day).join(', ')}.`
          : 'Day plan already saved. Every day is LOCKED. Do not ask for itineraries again.',
        packageName: current.packageName || args.packageName || null,
        pickupLocation: current.pickupLocation,
        dropLocation: current.dropLocation,
        packagePlaces: current.places,
        days: (current.days || []).map((day) => ({
          day: day.day,
          purpose: day.purpose,
          itineraryType: day.itineraryType,
          city: day.city,
          expectedTitle: day.expectedTitle,
          suggested: day.itineraryId
            ? { id: day.itineraryId, itineraryTitle: day.itineraryTitle, why: 'already chosen in draft' }
            : null,
          needsChoice: !day.itineraryId,
          candidates: day.itineraryId
            ? []
            : (day.candidates || []).map((c) => ({ id: c.id, itineraryTitle: c.title })),
        })),
        missing: draftMissingFields(current),
        draftSaved: true,
      },
    };
  }

  const plan = await planPackageDays(args);
  if (!plan.ok) return { kind: 'result', data: plan };

  const previousByDay = new Map(
    (current?.days || []).map((day) => [Number(day.day), day])
  );

  const merged = mergeDraft(currentDraft, {
    ...pick(args, ['packageName', 'state', 'packageType', 'packageCategory', 'hotelCategory', 'themes', 'tags']),
    pickupLocation: plan.pickupLocation,
    dropLocation: plan.dropLocation,
    duration: plan.derivedDuration,
    places: plan.packagePlaces,
    packageType: args.packageType || current?.packageType || 'Family',
    replaceDays: plan.days.map((d) => {
      const previous = previousByDay.get(Number(d.day));
      const keepChosen = Boolean(previous?.itineraryId);

      return {
        day: d.day,
        purpose: d.purpose,
        itineraryType: d.itineraryType,
        city: d.city,
        from: d.from,
        to: d.to,
        expectedTitle: d.expectedTitle,
        itineraryId: keepChosen ? previous.itineraryId : d.suggested?.id,
        itineraryTitle: keepChosen ? previous.itineraryTitle : d.suggested?.itineraryTitle,
        candidates: keepChosen
          ? []
          : (d.candidates || []).map((candidate) => ({
              id: candidate.id,
              title: candidate.itineraryTitle,
            })),
      };
    }),
  });

  const overlayedDays = plan.days.map((d) => {
    const saved = (merged.days || []).find((x) => Number(x.day) === Number(d.day));
    if (saved?.itineraryId) {
      return {
        ...d,
        suggested: { id: saved.itineraryId, itineraryTitle: saved.itineraryTitle, why: 'already chosen in draft' },
        needsChoice: false,
        candidates: [],
      };
    }
    return d;
  });

  return {
    kind: 'draft',
    draft: merged,
    data: {
      ...plan,
      days: overlayedDays,
      draftSaved: true,
      missing: draftMissingFields(merged),
    },
  };
}

// ------------------------------------------------------------------ draft

const DRAFT_SCALARS = [
  'packageName',
  'pickupLocation',
  'dropLocation',
  'duration',
  'state',
  'packageType',
  'packageCategory',
  'hotelCategory',
];

function plainDraft(draft) {
  if (!draft) return null;
  return typeof draft.toObject === 'function' ? draft.toObject() : { ...draft };
}

function resolveDayChoice(existingDay = {}, incoming = {}) {
  const candidates = existingDay.candidates || [];
  let itineraryId = incoming.itineraryId;
  let itineraryTitle = incoming.itineraryTitle;

  const rawChoice = incoming.choice ?? incoming.choiceIndex ?? incoming.option;
  if (itineraryId && !isHexObjectId(itineraryId)) {
    itineraryTitle = itineraryTitle || itineraryId;
    itineraryId = undefined;
  }
  if (!itineraryId && rawChoice != null && String(rawChoice).trim() !== '') {
    const words = { first: 1, pehla: 1, pehli: 1, second: 2, dusra: 2, third: 3, tisra: 3 };
    const asWord = words[String(rawChoice).trim().toLowerCase()];
    const index = asWord || Number(rawChoice);
    if (Number.isFinite(index) && index >= 1 && index <= candidates.length) {
      itineraryId = candidates[index - 1].id;
      itineraryTitle = candidates[index - 1].title;
    }
  }

  if (!itineraryId && itineraryTitle && candidates.length) {
    const want = normalizeTitle(itineraryTitle);
    const wantCore = stripTitleNoise(itineraryTitle);
    const hit = candidates.find(
      (c) => normalizeTitle(c.title) === want || stripTitleNoise(c.title) === wantCore
    );
    if (hit) {
      itineraryId = hit.id;
      itineraryTitle = hit.title;
    }
  }

  return definedFields({ ...incoming, itineraryId, itineraryTitle });
}

/**
 * Shallow merge for scalars, replace-by-key for lists.
 * days are merged per day number so a single day can be changed without
 * resending the whole plan.
 */
export function mergeDraft(current, patch = {}) {
  const base = plainDraft(current) || { places: [], days: [], policies: [], cabs: [] };

  for (const key of DRAFT_SCALARS) {
    if (patch[key] !== undefined && String(patch[key]).trim() !== '') {
      base[key] = normalizeLocation(patch[key]);
    }
  }
  for (const key of ['themes', 'tags']) {
    if (Array.isArray(patch[key])) base[key] = patch[key].map((v) => String(v).trim()).filter(Boolean);
  }
  if (patch.places !== undefined) base.places = packagePlacesFrom(patch.places);
  if (patch.confirmPolicies === true && !(base.policies || []).length) {
    base.policies = STANDARD_POLICY_NAMES.map((name) => ({
      name,
      removeIndices: [],
      addPoints: [],
    }));
  }
  if (patch.policies !== undefined) {
    const byName = new Map((base.policies || []).map((p) => [normalizeTitle(p.name), { ...p }]));
    for (const incoming of patch.policies || []) {
      const name = canonicalPolicyName(incoming?.name);
      if (!name) continue;
      const prev = byName.get(normalizeTitle(name)) || { name, removeIndices: [], addPoints: [] };
      byName.set(normalizeTitle(name), {
        name,
        removeIndices: incoming.removeIndices !== undefined
          ? (incoming.removeIndices || []).map(Number).filter(Number.isFinite)
          : prev.removeIndices || [],
        addPoints: incoming.addPoints !== undefined
          ? (incoming.addPoints || []).map((t) => String(t).trim()).filter(Boolean)
          : prev.addPoints || [],
      });
    }
    base.policies = [...byName.values()];
  }
  if (patch.cabOptions !== undefined) {
    base.cabOptions = (patch.cabOptions || []).map((c) => ({
      cabId: String(c.cabId || c._id || ''),
      cabName: c.cabName || '',
      cabType: c.cabType || '',
      seatingCapacity: c.seatingCapacity || c.cabSeatingCapacity || '',
    })).filter((c) => c.cabId || c.cabName);
  }
  if (patch.cabs !== undefined) {
    base.cabs = (patch.cabs || [])
      .filter((c) => c?.cabId)
      .map((c) => ({
        cabId: String(c.cabId).trim(),
        cabName: c.cabName || '',
        cabType: c.cabType || '',
        onSeasonPrice: String(c.onSeasonPrice ?? '').trim(),
        offSeasonPrice: String(c.offSeasonPrice ?? c.onSeasonPrice ?? '').trim(),
      }));
  }
  if (patch.margins) {
    base.margins = { ...(base.margins || {}), ...patch.margins };
  }

  if (patch.days !== undefined) {
    const byDay = new Map((base.days || []).map((d) => [Number(d.day), { ...d }]));
    for (const incoming of patch.days || []) {
      const dayNo = Number(incoming?.day);
      if (!Number.isFinite(dayNo)) continue;
      const previous = byDay.get(dayNo) || {};
      const resolved = resolveDayChoice(previous, incoming);
      const updated = { ...previous, ...definedFields(resolved), day: dayNo };
      if (updated.itineraryId) updated.candidates = [];
      byDay.set(dayNo, updated);
    }
    base.days = [...byDay.values()].sort((a, b) => a.day - b.day);
  }
  if (patch.replaceDays !== undefined) {
    base.days = (patch.replaceDays || []).map((d) => ({ ...d, day: Number(d.day) }));
  }

  base.updatedAt = new Date();
  return base;
}

export function draftMissingFields(draft) {
  const d = plainDraft(draft);
  const missing = [];
  if (!d) return ['everything: no draft started yet'];

  if (!d.packageName) missing.push('packageName');
  if (!d.pickupLocation) missing.push('pickupLocation');
  if (!d.state) missing.push('state');

  const places = d.places || [];
  if (!places.length) missing.push('places');
  else if (places.some((p) => !p.nights || p.nights < 1)) missing.push('nights for every place');

  const expected = places.length ? buildDaySkeleton({
    pickupLocation: d.pickupLocation,
    dropLocation: d.dropLocation || d.pickupLocation,
    places,
  }).length : 0;

  const days = d.days || [];
  const chosen = days.filter((x) => x.itineraryId);
  if (expected && chosen.length < expected) {
    const pending = [];
    for (let i = 1; i <= expected; i += 1) {
      if (!days.find((x) => Number(x.day) === i && x.itineraryId)) pending.push(i);
    }
    missing.push(`itinerary for day ${pending.join(', ')}`);
  }

  if (!(d.cabs || []).length) missing.push('at least one cab');
  else if ((d.cabs || []).some((c) => !c.onSeasonPrice)) missing.push('onSeasonPrice for every cab');

  if (!(d.policies || []).length) missing.push('inclusions/exclusions/policies confirmation');

  return missing;
}

/** Compact draft summary injected into the prompt every turn. */
export function describeDraft(draft) {
  const d = plainDraft(draft);
  if (!d) return null;

  const lines = ['CURRENT PACKAGE DRAFT (persisted, survives history trimming):'];
  for (const key of DRAFT_SCALARS) {
    if (d[key]) lines.push(`  ${key}: ${d[key]}`);
  }
  if ((d.places || []).length) {
    lines.push(`  places: ${d.places.map((p) => `${p.placeCover} ${p.nights}N`).join(', ')}`);
  }
  if ((d.days || []).length) {
    lines.push('  days:');
    for (const day of d.days) {
      if (day.itineraryId) {
        lines.push(`    Day ${day.day}: LOCKED — "${day.itineraryTitle}". Do not ask again.`);
        continue;
      }
      lines.push(`    Day ${day.day}: ASK — expected "${day.expectedTitle || day.city}"`);
      if (day.candidates?.length) {
        lines.push(
          `       OPTIONS: ${day.candidates
            .map((candidate, index) => `${index + 1}) ${candidate.title} [id=${candidate.id}]`)
            .join(' | ')}`
        );
      }
    }
  }
  if ((d.policies || []).length) {
    lines.push(
      `  policies: LOCKED — ${d.policies
        .map((p) => `${p.name}${p.removeIndices?.length ? ` -${p.removeIndices.join('/')}` : ''}${p.addPoints?.length ? ` +${p.addPoints.length}` : ''}`)
        .join(', ')}. Do not ask again.`
    );
  }
  if ((d.cabs || []).length) {
    lines.push(
      `  cabs: ${d.cabs
        .map((c) => {
          const label = c.cabName || c.cabId;
          const locked = isHexObjectId(c.cabId) ? 'LOCKED' : 'UNRESOLVED';
          return `${locked} ${label} (${c.cabType || 'cab'}) on=${c.onSeasonPrice || '?'} off=${c.offSeasonPrice || '?'}`;
        })
        .join(', ')}`
    );
    if ((d.cabs || []).some((c) => c.onSeasonPrice)) {
      lines.push('  Do not ask for the cab again. Only ask for a missing on/off season price.');
    }
  }

  const missing = draftMissingFields(d);
  lines.push(missing.length ? `  STILL MISSING: ${missing.join('; ')}` : '  COMPLETE: ready for create_package');
  return lines.join('\n');
}

async function findItineraryDoc(day = {}) {
  const id = String(day.itineraryId || '').trim();
  if (isHexObjectId(id)) {
    const docs = await findByAnyIds(Itinerary, [id]);
    if (docs[0]) return docs[0];
  }

  const fromCandidates = (day.candidates || []).find((c) => {
    if (isHexObjectId(id) && String(c.id) === id) return true;
    const title = day.itineraryTitle || (!isHexObjectId(id) ? id : '');
    return title && (normalizeTitle(c.title) === normalizeTitle(title) || stripTitleNoise(c.title) === stripTitleNoise(title));
  });
  if (fromCandidates?.id) {
    const docs = await findByAnyIds(Itinerary, [fromCandidates.id]);
    if (docs[0]) return docs[0];
  }

  const title = String(day.itineraryTitle || (!isHexObjectId(id) ? id : '') || '').trim();
  if (!title) return null;

  const filter = { status: 'enabled', itineraryTitle: looseExact(title) };
  if (day.city) filter.cityName = looseExact(day.city);
  const exact = await Itinerary.find(filter).limit(5).lean();
  if (exact[0]) return exact[0];

  const fuzzy = await Itinerary.find({
    status: 'enabled',
    itineraryTitle: contains(title),
    ...(day.city ? { cityName: looseExact(day.city) } : {}),
  })
    .limit(5)
    .lean();
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

async function updateDraft(args = {}, currentDraft) {
  const patch = { ...args };
  if (args.confirmPolicies === true || args.policiesConfirm === true) {
    patch.confirmPolicies = true;
  }
  if (args.cabs !== undefined) {
    patch.cabs = await resolveIncomingCabs(args.cabs, currentDraft);
  }
  const merged = mergeDraft(currentDraft, patch);
  if (!merged.packageType) merged.packageType = 'Family';

  for (const day of merged.days || []) {
    if (isHexObjectId(day.itineraryId)) continue;
    const doc = await findItineraryDoc(day);
    if (doc) {
      day.itineraryId = String(doc._id);
      day.itineraryTitle = doc.itineraryTitle;
      day.candidates = [];
    }
  }

  const missing = draftMissingFields(merged);
  return {
    kind: 'draft',
    draft: merged,
    data: {
      ok: true,
      saved: true,
      draft: {
        ...pick(merged, DRAFT_SCALARS),
        places: merged.places,
        days: (merged.days || []).map((d) => pick(d, ['day', 'itineraryTitle', 'itineraryId', 'expectedTitle'])),
        policies: merged.policies,
        cabs: merged.cabs,
      },
      missing,
      ready: missing.length === 0,
      ...(args.cabs !== undefined && !(merged.cabs || []).length
        ? { message: 'Cab not saved. Pass choiceIndex, cabName (e.g. Swift Dzire), or the cabId from search_cabs.' }
        : {}),
    },
  };
}

// ----------------------------------------------------------- create package

function itinerarySnapshot(doc) {
  return {
    itineraryTitle: doc.itineraryTitle,
    itineraryDescription: doc.itineraryDescription,
    cityName: doc.cityName,
    totalHours: doc.totalHours ?? null,
    distance: doc.distance ?? null,
    cityArea: Array.isArray(doc.cityArea) ? doc.cityArea : [],
    activities: [],
    sightseeing: [],
    inclusions: [],
    exclusions: [],
  };
}

/** Turns a completed draft into the exact body shape createAdd expects. */
export async function assemblePackageBody(draft, maker) {
  const d = plainDraft(draft);
  const missing = draftMissingFields(d);
  if (missing.length) {
    return { ok: false, missing, message: `Draft incomplete: ${missing.join('; ')}` };
  }

  const places = packagePlacesFrom(d.places);
  const pickupLocation = normalizeLocation(d.pickupLocation);
  const dropLocation = normalizeLocation(d.dropLocation) || pickupLocation;
  const nights = totalNightsOf(places);

  const orderedDays = [...(d.days || [])].sort((a, b) => Number(a.day) - Number(b.day));
  const itineraryDaysResolved = [];
  for (const day of orderedDays) {
    const doc = await findItineraryDoc(day);
    if (!doc) {
      return {
        ok: false,
        message: `Could not match Day ${day.day} itinerary "${day.itineraryTitle || day.itineraryId || day.expectedTitle}". Ask the user to pick from OPTIONS — do not say it was deleted.`,
      };
    }
    itineraryDaysResolved.push({ day: Number(day.day), doc });
  }

  const resolvedCabs = [];
  for (const entry of d.cabs || []) {
    const doc = await findCabDocument(entry, d.cabOptions || []);
    if (!doc?._id) {
      return {
        ok: false,
        message: `Could not match cab "${entry.cabName || entry.cabId}". Save it with update_package_draft using cabName or choiceIndex — do not tell the user it was deleted.`,
      };
    }
    resolvedCabs.push({
      cabId: String(doc._id),
      cabName: doc.cabName,
      cabType: doc.cabType,
      onSeasonPrice: entry.onSeasonPrice,
      offSeasonPrice: entry.offSeasonPrice || entry.onSeasonPrice,
      doc,
    });
  }
  if (!resolvedCabs.length) {
    return { ok: false, message: 'Pick a cab before creating the package.' };
  }

  const policyEntries = (d.policies || []).length
    ? d.policies
    : STANDARD_POLICY_NAMES.map((name) => ({ name, removeIndices: [], addPoints: [] }));
  const policyNames = policyEntries.map((p) => canonicalPolicyName(p.name));
  const policyDocs = policyNames.length
    ? await GlobalMaster.find({ $or: policyNames.map((n) => ({ name: looseExact(n) })) }).lean()
    : [];
  const policyByName = new Map(policyDocs.map((doc) => [normalizeTitle(doc.name), doc]));

  let packageInclusions = '';
  let packageExclusions = '';
  const customExclusions = [];
  for (const entry of policyEntries) {
    const name = canonicalPolicyName(entry.name);
    const doc = policyByName.get(normalizeTitle(name));
    if (!doc) {
      return { ok: false, message: `Policy block "${name}" not found in GlobalMaster.` };
    }
    const html = applyPolicyEdits(doc.description, entry);
    const slot = globalMasterSlot(doc.name);
    if (slot === 'packageInclusions') packageInclusions = html;
    else if (slot === 'packageExclusions') packageExclusions = html;
    else customExclusions.push({ name: doc.name, description: html });
  }

  const selectedCabs = {};
  for (const entry of resolvedCabs) {
    const embedded = embedCab(entry.doc, {
      onSeasonPrice: entry.onSeasonPrice,
      offSeasonPrice: entry.offSeasonPrice || entry.onSeasonPrice,
    });
    const type = entry.doc.cabType || 'Unknown';
    selectedCabs[type] = selectedCabs[type] || [];
    selectedCabs[type].push(embedded);
  }
  const prices = lowestCabPrices(selectedCabs);

  const finalCosting = computeFinalCosting({
    transportCost: prices.lowestOnSeasonPrice,
    margins: d.margins,
  });

  const itineraryDays = itineraryDaysResolved.map(({ day, doc }) => ({
    day,
    selectedItinerary: itinerarySnapshot(doc),
  }));

  // There is no createdBy on the Add model, so the logged-in user is recorded
  // here. It is the only trace of who built the package.
  const leaderName = [maker?.firstName, maker?.lastName].filter(Boolean).join(' ').trim();

  const packageObject = {
    packageType: d.packageType || 'Family',
    packageCategory: d.packageCategory || '',
    teamLeader: leaderName,
    teamLeaderId: maker?._id ? String(maker._id) : '',
    packageName: d.packageName,
    packageImages: [],
    priceTag: '',
    duration: formatDuration(nights),
    state: d.state,
    status: 'enabled',
    displayOrder: '',
    hotelCategory: d.hotelCategory || '',
    pickupLocation,
    pickupTransfer: false,
    dropLocation,
    validTill: '',
    tourBy: '',
    agentPackage: '',
    customizablePackage: false,
    packagePlaces: places,
    themes: d.themes || [],
    tags: d.tags || [],
    amenities: [],
    initialAmount: '',
    defaultHotelPackage: '',
    defaultVehicle: '',
    packageDescription: '',
    packageInclusions,
    packageExclusions,
    customExclusions,
    cityArea: itineraryDays.map((x) => ({ day: x.day, cityArea: [] })),
    itineraryDays,
  };

  return {
    ok: true,
    body: {
      package: packageObject,
      images: [],
      canonicalTag: '',
      metaTitle: '',
      metaKeywords: '',
      metaDescription: '',
      enablePageSchema: false,
      focusKeyword: '',
      schemaType: '',
      cabs: {
        travelPrices: {
          prices,
          selectedCabs,
          travelInfo: buildTravelInfo({ pickupLocation, dropLocation, places }),
        },
      },
      finalCosting,
      activities: [],
      sightseeing: [],
    },
  };
}

function createPreviewFrom(draft, body) {
  const pkg = body.package;
  return {
    packageName: pkg.packageName,
    duration: pkg.duration,
    state: pkg.state,
    packageType: pkg.packageType,
    pickupLocation: pkg.pickupLocation,
    dropLocation: pkg.dropLocation,
    places: pkg.packagePlaces.map((p) => `${p.placeCover} ${p.nights}N`),
    days: pkg.itineraryDays.map((x) => `${x.day}. ${x.selectedItinerary.itineraryTitle}`),
    inclusionPoints: policyPoints(pkg.packageInclusions).length,
    exclusionPoints: policyPoints(pkg.packageExclusions).length,
    policies: pkg.customExclusions.map((c) => c.name),
    cabs: Object.entries(body.cabs.travelPrices.selectedCabs).flatMap(([type, list]) =>
      list.map((c) => `${type} ${c.cabName} on=${c.prices.onSeasonPrice} off=${c.prices.offSeasonPrice}`)
    ),
    baseTotal: body.finalCosting.baseTotal,
    finalPrices: body.finalCosting.finalPrices,
  };
}

async function createPackage(args = {}, { user, maker, executeWrites, draft } = {}) {
  const source = args.draft || draft;
  const assembled = await assemblePackageBody(source, maker);
  if (!assembled.ok) {
    return { kind: 'result', data: { ok: false, kind: 'need_more', ...assembled } };
  }

  if (!executeWrites) {
    return {
      kind: 'confirm',
      tool: 'create_package',
      // The draft is snapshotted so a later confirm cannot pick up drifted data.
      args: { draft: plainDraft(source) },
      preview: createPreviewFrom(source, assembled.body),
    };
  }

  const { body } = assembled;
  const wrapped = await runController(createAdd, { user, body });
  const data = wrapped.data || {};

  if (wrapped.statusCode >= 400) {
    if (data.duplicatePackage) {
      return {
        kind: 'result',
        data: {
          ok: false,
          duplicate: true,
          message: `A package with the same route, duration and day titles already exists: "${data.duplicatePackage.packageName}". Ask the user to change a day, the places or the pickup/drop, or to edit that package instead.`,
          existing: data.duplicatePackage,
        },
      };
    }
    return { kind: 'result', data: { ok: false, message: data.message || 'Could not create the package' } };
  }

  return {
    kind: 'result',
    data: {
      ok: true,
      created: true,
      message: `Package "${body.package.packageName}" created.`,
      packageId: data?._id ? String(data._id) : undefined,
      duration: body.package.duration,
      days: body.package.itineraryDays.length,
      finalPrices: body.finalCosting.finalPrices,
    },
    clearDraft: true,
  };
}

// ---------------------------------------------------------------- schemas

export const AI_PACKAGE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'plan_package_days',
      description:
        'Build the day-by-day plan from pickup, drop and places with nights. Call ONLY when the draft has no days yet, or the user changed pickup, drop or places. Never call again to confirm an itinerary. If days already exist, the server reuses them and will not re-ask LOCKED days.',
      parameters: {
        type: 'object',
        required: ['pickupLocation', 'places'],
        properties: {
          packageName: { type: 'string' },
          pickupLocation: { type: 'string', description: 'City the tour starts from' },
          dropLocation: { type: 'string', description: 'City the tour ends at. Defaults to pickupLocation.' },
          duration: { type: 'string', description: 'What the user said, e.g. 4D/3N. Used only to cross-check nights.' },
          places: {
            type: 'array',
            description: 'Stay places in travel order with nights each',
            items: {
              type: 'object',
              required: ['placeCover', 'nights'],
              properties: {
                placeCover: { type: 'string' },
                nights: { type: 'number' },
              },
            },
          },
          cabOnSeasonPrice: { type: 'number', description: 'Only pass once the user has given the cab price' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_package_draft',
      description:
        'Save a user decision into the persistent draft. When the user picks a day itinerary, call this immediately with that day only. You can pass itineraryId, or choiceIndex 1/2/3 matching the OPTIONS list, or the itineraryTitle. Never re-ask a LOCKED day.',
      parameters: {
        type: 'object',
        properties: {
          packageName: { type: 'string' },
          pickupLocation: { type: 'string' },
          dropLocation: { type: 'string' },
          state: { type: 'string', description: 'Indian state, e.g. Himachal Pradesh. Required before create.' },
          packageType: { type: 'string', description: 'e.g. Family, Honeymoon, Group. Required before create.' },
          packageCategory: { type: 'string' },
          hotelCategory: { type: 'string' },
          themes: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          places: {
            type: 'array',
            description: 'Replaces the whole places list. Re-run plan_package_days after changing this.',
            items: {
              type: 'object',
              properties: { placeCover: { type: 'string' }, nights: { type: 'number' } },
            },
          },
          days: {
            type: 'array',
            description: 'Merged by day number. Send only the days the user just decided.',
            items: {
              type: 'object',
              required: ['day'],
              properties: {
                day: { type: 'number' },
                itineraryId: { type: 'string', description: 'id from OPTIONS or search_itineraries' },
                itineraryTitle: { type: 'string' },
                choiceIndex: {
                  type: 'number',
                  description: '1-based option number the user picked, e.g. 1 for pehla/first',
                },
                choice: {
                  type: 'string',
                  description: 'Same as choiceIndex, or first/second/pehla',
                },
              },
            },
          },
          policies: {
            type: 'array',
            description:
              'Merged by name. Use exact GlobalMaster names. Sending Inclusion alone will not wipe the other blocks.',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                removeIndices: { type: 'array', items: { type: 'number' } },
                addPoints: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          confirmPolicies: {
            type: 'boolean',
            description: 'Set true when the user accepts standard inclusions/exclusions/policies.',
          },
          cabs: {
            type: 'array',
            description:
              'Replaces the cab list. cabId is optional — cabName or choiceIndex from the last search_cabs list is enough. Prices can be sent later.',
            items: {
              type: 'object',
              properties: {
                cabId: { type: 'string', description: '24-char id from search_cabs. Do not put the cab name here.' },
                cabName: { type: 'string', description: 'e.g. Swift Dzire' },
                choiceIndex: { type: 'number', description: '1-based option from the last search_cabs list' },
                choice: { type: 'string' },
                onSeasonPrice: { type: 'string' },
                offSeasonPrice: { type: 'string' },
              },
            },
          },
          margins: {
            type: 'object',
            description: 'Percent margins. Defaults to 5 each.',
            properties: {
              b2b: { type: 'number' },
              internal: { type: 'number' },
              website: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_package',
      description:
        'Create the package from the saved draft. Call only when the draft reports nothing missing. The server asks the user to confirm before saving.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_package_draft',
      description: 'Discard the current package draft and start over.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_itineraries',
      description:
        'Search the master itinerary library. Requires cityName or titleContains. itineraryType is travel (transfer between cities) or sightseeing (local day).',
      parameters: {
        type: 'object',
        properties: {
          cityName: { type: 'string', description: 'Matched case-insensitively' },
          country: { type: 'string' },
          itineraryType: { type: 'string', description: 'travel or sightseeing' },
          titleContains: { type: 'string' },
          status: { type: 'string', description: 'enabled or disabled. Defaults to enabled.' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_itinerary',
      description: 'Get one master itinerary with its full description.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_globalmaster',
      description:
        'Get the standard inclusion, exclusion and policy blocks. This is the only allowed source for that text. Returns plain-text points plus which package field each block fills.',
      parameters: {
        type: 'object',
        properties: {
          names: {
            type: 'array',
            description: 'Specific block names. Omit to get all.',
            items: { type: 'string' },
          },
          namesOnly: { type: 'boolean', description: 'Return only names and slots, without the points' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_cabs',
      description:
        'List cabs grouped by cabType (Hatchback, Sedan, SUV, Traveller, ACBus). The collection has no price, so the price must always be asked from the user.',
      parameters: {
        type: 'object',
        properties: {
          cabType: { type: 'string' },
          query: { type: 'string', description: 'Partial cab name, e.g. tempo' },
          seatingCapacity: { type: 'string', description: 'e.g. 12 Seater' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_packages',
      description: 'Search existing packages. Requires at least one filter. Returns a compact summary with day titles.',
      parameters: {
        type: 'object',
        properties: {
          packageName: { type: 'string' },
          state: { type: 'string' },
          duration: { type: 'string', description: 'e.g. 4D/3N' },
          status: { type: 'string', description: 'enabled or disabled' },
          packageType: { type: 'string' },
          pickupLocation: { type: 'string' },
          dropLocation: { type: 'string' },
          place: { type: 'string', description: 'A place that must be covered' },
          countOnly: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_package',
      description: 'Get one package with day titles, inclusions, exclusions and policies as plain text.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  },
];

export const AI_PACKAGE_TOOL_NAMES = new Set(AI_PACKAGE_TOOLS.map((t) => t.function.name));

export const PACKAGE_WRITE_TOOLS = new Set(['create_package']);

export async function executePackageTool(name, args = {}, context = {}) {
  try {
    switch (name) {
      case 'plan_package_days':
        return await planAndSaveDraft(args, context.draft);
      case 'update_package_draft':
        return await updateDraft(args, context.draft);
      case 'clear_package_draft':
        return { kind: 'draft', draft: null, data: { ok: true, message: 'Draft cleared.' } };
      case 'create_package':
        return await createPackage(args, context);
      case 'search_itineraries':
        return { kind: 'result', data: await searchItineraries(args) };
      case 'get_itinerary':
        return { kind: 'result', data: await getItinerary(args) };
      case 'get_globalmaster': {
        const data = await getGlobalMaster(args, context.draft);
        if (data.alreadyChosen) return { kind: 'result', data };
        const defaults = (data.entries || [])
          .filter((e) => !e.optional)
          .map((e) => ({ name: e.name, removeIndices: [], addPoints: [] }));
        const shouldSave = !(context.draft?.policies || []).length && defaults.length;
        const merged = shouldSave
          ? mergeDraft(context.draft, { policies: defaults })
          : context.draft;
        return {
          kind: shouldSave ? 'draft' : 'result',
          draft: merged,
          data: {
            ...data,
            ...(shouldSave ? { savedDefaults: true, message: 'Standard inclusion/exclusion/policies saved on the draft. Do not ask again unless the user wants an edit.' } : {}),
          },
        };
      }
      case 'search_cabs': {
        const data = await searchCabs(args, context.draft);
        const merged = mergeDraft(context.draft, {
          cabOptions: data.cabOptions || context.draft?.cabOptions || [],
        });
        return { kind: 'draft', draft: merged, data };
      }
      case 'search_packages':
        return { kind: 'result', data: await searchPackages(args) };
      case 'get_package':
        return { kind: 'result', data: await getPackage(args) };
      default:
        return { kind: 'result', data: { ok: false, message: `Unknown package tool: ${name}` } };
    }
  } catch (error) {
    return { kind: 'result', data: { ok: false, message: error.message || 'Package tool failed' } };
  }
}

export { htmlToPoints, itineraryPreview, packagePreview, READ_ONLY_TOOLS };
export { planPackageDays };
