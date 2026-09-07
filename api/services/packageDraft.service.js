/**
 * Pure package-planning logic. No database, no network.
 *
 * Day rule, verified against existing packages:
 *   total days = total nights + 1
 *   each place  = 1 travel/transfer day + (nights - 1) local sightseeing days
 *   last day    = travel from the final place to the drop location
 */

const DURATION_RE = /^\s*(\d+)\s*D\s*\/\s*(\d+)\s*N\s*$/i;

export function normalizeLocation(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeTitle(value) {
  return normalizeLocation(value).toLowerCase();
}

/**
 * Real titles carry decoration around the "X to Y" core, e.g.
 * "Arrival Delhi to Dharamshala", "Day 00 – Delhi to Manali (Overnight by Volvo)",
 * "Manali to Dharamshala Drop". This reduces them to the comparable core.
 */
export function stripTitleNoise(value) {
  return normalizeTitle(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^day\s*\d+\s*[–—:.-]*\s*/, '')
    .replace(/^(arrival|departure)\s+(in\s+|from\s+)?/, '')
    .replace(/\s+(drop|departure|arrival)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDuration(nights) {
  const n = Number(nights) || 0;
  return `${n + 1}D/${n}N`;
}

/** "4d / 3 n" -> "4D/3N". Returns null when unparseable. */
export function normalizeDuration(value) {
  const m = String(value ?? '').match(DURATION_RE);
  if (!m) return null;
  return `${Number(m[1])}D/${Number(m[2])}N`;
}

export function parseDuration(value) {
  const m = String(value ?? '').match(DURATION_RE);
  if (!m) return null;
  return { days: Number(m[1]), nights: Number(m[2]) };
}

export function normalizePlaces(places = []) {
  return (Array.isArray(places) ? places : [])
    .map((p) => ({
      placeCover: normalizeLocation(p?.placeCover ?? p?.place ?? p?.name),
      nights: Number(p?.nights ?? 0),
      transfer: Boolean(p?.transfer ?? false),
    }))
    .filter((p) => p.placeCover);
}

export function totalNightsOf(places = []) {
  return normalizePlaces(places).reduce((sum, p) => sum + (Number(p.nights) || 0), 0);
}

/**
 * Build the ordered day plan.
 * Each entry describes what the day IS; it does not pick an itinerary.
 */
export function buildDaySkeleton({ pickupLocation, dropLocation, places } = {}) {
  const pickup = normalizeLocation(pickupLocation);
  const list = normalizePlaces(places);
  const drop = normalizeLocation(dropLocation) || pickup;

  const days = [];
  let dayNo = 1;
  let previous = pickup;

  for (const place of list) {
    days.push({
      day: dayNo++,
      purpose: 'transfer',
      itineraryType: 'travel',
      from: previous,
      to: place.placeCover,
      city: place.placeCover,
      expectedTitle: `${previous} to ${place.placeCover}`,
    });

    const localDays = Math.max(0, (Number(place.nights) || 0) - 1);
    for (let i = 1; i <= localDays; i += 1) {
      days.push({
        day: dayNo++,
        purpose: 'local',
        itineraryType: 'sightseeing',
        from: place.placeCover,
        to: place.placeCover,
        city: place.placeCover,
        localIndex: i,
        expectedTitle: `${place.placeCover} Local Sightseeing`,
      });
    }

    previous = place.placeCover;
  }

  if (list.length) {
    days.push({
      day: dayNo++,
      purpose: 'departure',
      itineraryType: 'travel',
      from: previous,
      to: drop,
      city: drop,
      expectedTitle: `${previous} to ${drop}`,
    });
  }

  return days;
}

/**
 * Route legs stored on cabs.travelPrices.travelInfo:
 * pickup -> place1 -> place2 ... -> drop
 */
export function buildTravelInfo({ pickupLocation, dropLocation, places } = {}) {
  const pickup = normalizeLocation(pickupLocation);
  const list = normalizePlaces(places);
  const drop = normalizeLocation(dropLocation) || pickup;
  if (!list.length) return [];

  const legs = [];
  let previous = pickup;
  for (const place of list) {
    legs.push({ from: previous, to: place.placeCover });
    previous = place.placeCover;
  }
  legs.push({ from: previous, to: drop });
  return legs;
}

export function packagePlacesFrom(places = []) {
  return normalizePlaces(places).map((p) => ({
    placeCover: p.placeCover,
    nights: p.nights,
    transfer: p.transfer,
  }));
}

const DEFAULT_MARGINS = { b2b: 5, internal: 5, website: 5 };

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mirrors the shape found on existing packages:
 *   baseTotal   = hotel + transport + activities + sedan
 *   finalPrices = baseTotal * (1 + margin/100), rounded
 * transportCost is stored as a string on existing documents, so it is kept as one.
 */
export function computeFinalCosting({
  transportCost = 0,
  hotelCost = 0,
  activitiesTotalCost = 0,
  sedanCost = 0,
  margins,
} = {}) {
  const transport = toNumber(transportCost);
  const hotel = toNumber(hotelCost);
  const activities = toNumber(activitiesTotalCost);
  const sedan = toNumber(sedanCost);
  const baseTotal = hotel + transport + activities + sedan;

  const merged = { ...DEFAULT_MARGINS, ...(margins || {}) };
  const finalPrices = {};
  for (const [key, pct] of Object.entries(merged)) {
    finalPrices[key] = Math.round(baseTotal * (1 + toNumber(pct) / 100));
  }

  return {
    baseTotal,
    margins: merged,
    finalPrices,
    breakdown: {
      hotelCost: hotel,
      transportCost: String(transport),
      activitiesTotalCost: activities,
      sedanCost: sedan,
    },
  };
}

/**
 * Lowest price across every selected cab.
 * Existing documents are inconsistent here, so this is always recomputed
 * rather than trusted from stored data.
 */
export function lowestCabPrices(selectedCabs = {}) {
  const on = [];
  const off = [];
  for (const list of Object.values(selectedCabs || {})) {
    for (const cab of Array.isArray(list) ? list : []) {
      const onPrice = Number(cab?.prices?.onSeasonPrice);
      const offPrice = Number(cab?.prices?.offSeasonPrice);
      if (Number.isFinite(onPrice)) on.push(onPrice);
      if (Number.isFinite(offPrice)) off.push(offPrice);
    }
  }
  return {
    lowestOnSeasonPrice: on.length ? String(Math.min(...on)) : '',
    lowestOffSeasonPrice: off.length ? String(Math.min(...off)) : '',
  };
}

/**
 * Cabs collection field names differ from the names embedded on a package.
 * cabSeatingCapacity -> seatingCapacity, cabLuggage -> luggage,
 * and prices._id repeats the cab id.
 */
export function embedCab(cab, { onSeasonPrice = '', offSeasonPrice = '' } = {}) {
  const cabId = cab?._id ? String(cab._id) : '';
  return {
    cabId,
    cabName: cab?.cabName || '',
    cabType: cab?.cabType || '',
    seatingCapacity: cab?.cabSeatingCapacity || '',
    luggage: cab?.cabLuggage || '',
    prices: {
      onSeasonPrice: String(onSeasonPrice ?? ''),
      offSeasonPrice: String(offSeasonPrice ?? ''),
      _id: cabId,
    },
    seasonDates: { onSeason: [], offSeason: [] },
  };
}

export function planWarnings({ places, duration }) {
  const warnings = [];
  const list = normalizePlaces(places);
  const nights = totalNightsOf(list);

  for (const place of list) {
    if (!place.nights || place.nights < 1) {
      warnings.push(`"${place.placeCover}" has no nights. Ask the user how many nights.`);
    }
  }

  if (duration) {
    const asked = normalizeDuration(duration);
    const derived = formatDuration(nights);
    if (!asked) {
      warnings.push(`Could not read duration "${duration}". Expected format like 4D/3N.`);
    } else if (asked !== derived) {
      warnings.push(
        `Duration mismatch: user said ${asked} but ${nights} night(s) across places means ${derived}. Ask the user which is correct.`
      );
    }
  }

  return warnings;
}

export const PACKAGE_DRAFT_DEFAULT_MARGINS = DEFAULT_MARGINS;
