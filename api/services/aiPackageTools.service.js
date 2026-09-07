import mongoose from 'mongoose';
import Add from '../models/add.model.js';
import Itinerary from '../models/itenary.model.js';
import GlobalMaster from '../models/globalmaster.model.js';
import Cabs from '../models/cabs.model.js';
import {
  buildDaySkeleton,
  buildTravelInfo,
  computeFinalCosting,
  formatDuration,
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

async function getGlobalMaster(args = {}) {
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
    points: args.namesOnly ? undefined : htmlToPoints(row.description),
  }));

  return {
    ok: true,
    total: entries.length,
    entries,
    slotRule:
      'Inclusion -> package.packageInclusions, Exclusions -> package.packageExclusions, everything else -> package.customExclusions[]. Entries marked optional are only used when the user asks for them.',
    editRule:
      'These are stored as formatted HTML. Show the points as plain text and ask the user to confirm. Edits must be per-point (add / remove / reword one point) so the stored formatting survives.',
  };
}

async function searchCabs(args = {}) {
  const filter = {};
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

  return {
    ok: true,
    total: rows.length,
    availableCabTypes: allTypes,
    cabsByType: grouped,
    priceRule:
      'The Cabs collection stores no price. Always ask the user for onSeasonPrice and offSeasonPrice for each selected cab. Never guess a price.',
  };
}

function addIdFilter(id) {
  const raw = String(id);
  const ids = [raw];
  if (mongoose.isValidObjectId(raw)) ids.push(new mongoose.Types.ObjectId(raw));
  return { _id: { $in: ids } };
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
      inclusions: htmlToPoints(pkg.packageInclusions),
      exclusions: htmlToPoints(pkg.packageExclusions),
      customExclusions: (pkg.customExclusions || []).map((c) => ({
        name: c?.name,
        points: htmlToPoints(c?.description),
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
      'Confirm every day where needsChoice is true by showing the candidate titles.',
      'Call get_globalmaster and ask the user to confirm or edit inclusions, exclusions and policies.',
      'Ask the cabType, then call search_cabs, then ask the on-season and off-season price.',
      'Saving is not enabled yet: present the final plan and tell the user it cannot be saved in this version.',
    ],
  };
}

// ---------------------------------------------------------------- schemas

export const AI_PACKAGE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'plan_package_days',
      description:
        'Build the day-by-day plan for a new package from pickup, drop and places with nights, and return matching itinerary candidates for each day. Use this first for any package creation request. Read-only: nothing is saved.',
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

export async function executePackageTool(name, args = {}) {
  try {
    switch (name) {
      case 'plan_package_days':
        return { kind: 'result', data: await planPackageDays(args) };
      case 'search_itineraries':
        return { kind: 'result', data: await searchItineraries(args) };
      case 'get_itinerary':
        return { kind: 'result', data: await getItinerary(args) };
      case 'get_globalmaster':
        return { kind: 'result', data: await getGlobalMaster(args) };
      case 'search_cabs':
        return { kind: 'result', data: await searchCabs(args) };
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
