import mongoose from "mongoose";
import Add from "../models/add.model.js";
import { errorHandler } from "../utils/error.js";
import { generatePackageSignature, findDuplicatePackageAnywhere, buildDuplicateResponse } from "../utils/packageSignature.js";

// --------------------------------------
// SUPER FAST IN-MEMORY CACHE + HELPERS
// --------------------------------------
const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 min
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 400;

let cachedTotal = null;
let cachedTotalExpire = 0;

const cacheGet = (key) => {
  const item = cache.get(key);
  if (!item || item.expire < Date.now()) return null;
  return item.data;
};

const cacheSet = (key, data) =>
  cache.set(key, { data, expire: Date.now() + TTL });

const cacheClear = () => {
  cache.clear();
  cachedTotal = null;
  cachedTotalExpire = 0;
};

const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
};

const getEstimatedTotal = async () => {
  if (cachedTotal !== null && cachedTotalExpire > Date.now()) {
    return cachedTotal;
  }
  cachedTotal = await Add.estimatedDocumentCount();
  cachedTotalExpire = Date.now() + TTL;
  return cachedTotal;
};

const buildPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit) || 0;
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const SEARCH_MAX_LIMIT = 50;
const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MIN_CHARS = 2;

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeSearchText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

/** Full state name match — ignores case; avoids $text OR on words like "pradesh". */
const buildExactStateFilter = (state) => {
  const normalized = normalizeSearchText(state);
  if (!normalized) return null;
  return {
    "package.state": {
      $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i"),
    },
  };
};

/** Exact field match — case/space friendly (handles "Delhi " / "delhi" in DB). */
const buildFlexibleExactFieldFilter = (fieldPath, value) => {
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;
  return {
    [fieldPath]: {
      $regex: new RegExp(`^\\s*${escapeRegex(normalized)}\\s*$`, "i"),
    },
  };
};

/**
 * Parse places query:
 * - "Bir Billing:1,Dalhousie:2"
 * - ["Bir Billing:1", "Dalhousie:2"]
 * - JSON: [{"placeCover":"Dalhousie","nights":2}]
 */
const parsePlaceToken = (token) => {
  if (token && typeof token === "object") {
    const placeCover = normalizeSearchText(
      token.placeCover || token.place || token.name
    );
    if (!placeCover) return null;
    const nightsRaw = token.nights;
    const nights =
      nightsRaw === "" || nightsRaw == null ? null : Number(nightsRaw);
    return {
      placeCover,
      nights: Number.isFinite(nights) ? nights : null,
    };
  }

  const str = String(token || "").trim();
  if (!str) return null;

  const lastColon = str.lastIndexOf(":");
  if (lastColon > 0) {
    const placeCover = normalizeSearchText(str.slice(0, lastColon));
    const nights = Number(str.slice(lastColon + 1).trim());
    if (!placeCover) return null;
    return {
      placeCover,
      nights: Number.isFinite(nights) ? nights : null,
    };
  }

  const placeCover = normalizeSearchText(str);
  return placeCover ? { placeCover, nights: null } : null;
};

const parsePlacesFilter = (query) => {
  const raw = query.places;
  if (raw == null || raw === "") return [];

  if (Array.isArray(raw)) {
    return raw.map(parsePlaceToken).filter(Boolean);
  }

  const str = String(raw).trim();
  if (str.startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map(parsePlaceToken).filter(Boolean);
      }
    } catch {
      // fall through to comma-separated
    }
  }

  return str
    .split(",")
    .map((part) => parsePlaceToken(part))
    .filter(Boolean);
};

/** Each place must exist in packagePlaces (placeCover + optional nights). */
const buildPlacesFilter = (places) => {
  if (!places.length) return null;

  const conditions = places.map(({ placeCover, nights }) => {
    const elemMatch = {
      placeCover: {
        $regex: new RegExp(`^\\s*${escapeRegex(placeCover)}\\s*$`, "i"),
      },
    };
    if (nights != null) elemMatch.nights = nights;
    return { "package.packagePlaces": { $elemMatch: elemMatch } };
  });

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

const buildWildcardTextSearch = (value) => {
  const words = normalizeSearchText(value)
    .split(" ")
    .map((w) => w.replace(/[^\w]/gi, ""))
    .filter((w) => w.length >= SEARCH_MIN_CHARS);

  if (words.length === 0) return "";
  return words.map((w) => `${w}*`).join(" ");
};

const stripTextScore = (rows) =>
  rows.map(({ score: _score, ...rest }) => rest);

const packageProjection = {
  "package.packageType": 1,
  "package.packageCategory": 1,
  "package.packageName": 1,
  "package.packageImages": 1,
  "package.state": 1,
  "package.priceTag": 1,
  "package.duration": 1,
  "package.status": 1,
  "package.displayOrder": 1,
  "package.hotelCategory": 1,
  "package.pickupLocation": 1,
  "package.pickupTransfer": 1,
  "package.dropLocation": 1,
  "package.validTill": 1,
  "package.tourBy": 1,
  "package.agentPackage": 1,
  "package.customizablePackage": 1,
  "package.packagePlaces": 1,
  "package.themes": 1,
  "package.tags": 1,
  metaTitle: 1,
  metaKeywords: 1,
  metaDescription: 1,
  enablePageSchema: 1,
  focusKeyword: 1,
  schemaType: 1,
  images: 1,
  canonicalTag: 1,
};

// --------------------------------------
// CREATE ADD
// --------------------------------------
export const createAdd = async (req, res, next) => {
  try {
    const pkg = req.body.package;
    if (!pkg) {
      return next(errorHandler(400, "Package data is required"));
    }

    const uniqueSignature = generatePackageSignature(pkg);
    const existing = await findDuplicatePackageAnywhere(uniqueSignature);

    if (existing) {
      return res.status(400).json(buildDuplicateResponse(existing));
    }

    const add = await Add.create({
      ...req.body,
      uniqueSignature,
    });
    cacheClear();
    return res.status(201).json(add.toObject ? add.toObject() : add);
  } catch (error) {
    if (error.code === 11000 && req.body?.package) {
      const existing = await findDuplicatePackageAnywhere(
        generatePackageSignature(req.body.package)
      );
      if (existing) {
        return res.status(400).json(buildDuplicateResponse(existing));
      }
    }
    next(error);
  }
};

// --------------------------------------
// GET ALL ADDS (FAST + CACHED)
// --------------------------------------
export const getAdds = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const cacheKey = `adds_${page}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const [adds, total] = await Promise.all([
      Add.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      getEstimatedTotal(),
    ]);

    const data = {
      adds,
      pagination: buildPagination(page, limit, total),
    };

    cacheSet(cacheKey, data);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// GET SINGLE ADD
// --------------------------------------
export const getAdd = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, "Invalid package id"));
    }

    const cacheKey = `add_${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const add = await Add.findById(id).lean();
    if (!add) return next(errorHandler(404, "Add not found!"));

    cacheSet(cacheKey, add);
    return res.status(200).json(add);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// UPDATE ADD
// --------------------------------------
export const updateAdd = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, "Invalid package id"));
    }

    const updateData = { ...req.body };

    if (req.body.package) {
      const uniqueSignature = generatePackageSignature(req.body.package);
      const existing = await findDuplicatePackageAnywhere(uniqueSignature, {
        excludeAddId: id,
      });

      if (existing) {
        return res.status(400).json(buildDuplicateResponse(existing));
      }

      updateData.uniqueSignature = uniqueSignature;
    }

    const add = await Add.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: false,
    }).lean();

    if (!add) return next(errorHandler(404, "Add not found!"));

    cacheClear();
    return res.status(200).json(add);
  } catch (error) {
    if (error.code === 11000 && req.body?.package) {
      const existing = await findDuplicatePackageAnywhere(
        generatePackageSignature(req.body.package),
        { excludeAddId: req.params.id }
      );
      if (existing) {
        return res.status(400).json(buildDuplicateResponse(existing));
      }
    }
    next(error);
  }
};

// --------------------------------------
// MIGRATE PACKAGE SIGNATURES (one-time)
// --------------------------------------
export const migratePackageSignatures = async (req, res, next) => {
  try {
    // Drop old unique index so same signature can exist on existing duplicate packages
    try {
      await Add.collection.dropIndex("uniqueSignature_1");
    } catch (_) {
      // index may not exist yet
    }
    await Add.collection.createIndex({ uniqueSignature: 1 });

    const packages = await Add.find().select("package").lean();

    const bulkOps = [];
    let updated = 0;
    let skipped = 0;

    for (const doc of packages) {
      const signature = generatePackageSignature(doc.package);
      if (!signature) {
        skipped++;
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { uniqueSignature: signature } },
        },
      });
      updated++;
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      const batch = bulkOps.slice(i, i + BATCH_SIZE);
      await Add.bulkWrite(batch, { ordered: false });
    }

    const duplicateGroups = await Add.aggregate([
      { $match: { uniqueSignature: { $ne: "" } } },
      {
        $group: {
          _id: "$uniqueSignature",
          count: { $sum: 1 },
          packages: {
            $push: {
              id: "$_id",
              packageName: "$package.packageName",
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    cacheClear();

    return res.status(200).json({
      success: true,
      message: "Unique signatures created for all packages",
      stats: {
        total: packages.length,
        updated,
        skipped,
        duplicateGroups: duplicateGroups.length,
      },
      duplicates: duplicateGroups.map((group) => ({
        signature: group._id,
        count: group.count,
        packages: group.packages,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// UPDATE ONLY IMAGES + CANONICAL TAG
// --------------------------------------
export const updateAddMediaAndCanonical = async (req, res, next) => {
  try {
    const allowedKeys = new Set([
      "images",
      "canonicalTag",
      "metaTitle",
      "metaKeywords",
      "metaDescription",
      "enablePageSchema",
      "focusKeyword",
      "schemaType"
    ]);
    const bodyKeys = Object.keys(req.body || {});

    // Reject if request contains anything except the two allowed keys
    const invalidKeys = bodyKeys.filter((k) => !allowedKeys.has(k));
    if (invalidKeys.length > 0) {
      return next(
        errorHandler(
          400,
          `Only images and canonicalTag can be updated here. Invalid fields: ${invalidKeys.join(
            ", "
          )}`
        )
      );
    }

    const updateDoc = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "canonicalTag")) {
      if (
        req.body.canonicalTag !== null &&
        req.body.canonicalTag !== undefined &&
        typeof req.body.canonicalTag !== "string"
      ) {
        return next(errorHandler(400, "canonicalTag must be a string"));
      }
      updateDoc.canonicalTag = (req.body.canonicalTag || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "metaTitle")) {
      if (
        req.body.metaTitle !== null &&
        req.body.metaTitle !== undefined &&
        typeof req.body.metaTitle !== "string"
      ) {
        return next(errorHandler(400, "metaTitle must be a string"));
      }
      updateDoc.metaTitle = (req.body.metaTitle || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "metaKeywords")) {
      if (
        req.body.metaKeywords !== null &&
        req.body.metaKeywords !== undefined &&
        typeof req.body.metaKeywords !== "string"
      ) {
        return next(errorHandler(400, "metaKeywords must be a string"));
      }
      updateDoc.metaKeywords = (req.body.metaKeywords || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "metaDescription")) {
      if (
        req.body.metaDescription !== null &&
        req.body.metaDescription !== undefined &&
        typeof req.body.metaDescription !== "string"
      ) {
        return next(errorHandler(400, "metaDescription must be a string"));
      }
      updateDoc.metaDescription = (req.body.metaDescription || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "enablePageSchema")) {
      if (
        req.body.enablePageSchema !== null &&
        req.body.enablePageSchema !== undefined &&
        typeof req.body.enablePageSchema !== "boolean"
      ) {
        return next(errorHandler(400, "enablePageSchema must be a boolean"));
      }
      updateDoc.enablePageSchema = !!req.body.enablePageSchema;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "focusKeyword")) {
      if (
        req.body.focusKeyword !== null &&
        req.body.focusKeyword !== undefined &&
        typeof req.body.focusKeyword !== "string"
      ) {
        return next(errorHandler(400, "focusKeyword must be a string"));
      }
      updateDoc.focusKeyword = (req.body.focusKeyword || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "schemaType")) {
      if (
        req.body.schemaType !== null &&
        req.body.schemaType !== undefined &&
        typeof req.body.schemaType !== "string"
      ) {
        return next(errorHandler(400, "schemaType must be a string"));
      }
      updateDoc.schemaType = (req.body.schemaType || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "images")) {
      if (!Array.isArray(req.body.images)) {
        return next(errorHandler(400, "images must be an array"));
      }

      // Sanitize each image object (only keep known fields)
      updateDoc.images = req.body.images.map((img) => {
        const safe = img && typeof img === "object" ? img : {};
        return {
          name: typeof safe.name === "string" ? safe.name : "",
          preview: typeof safe.preview === "string" ? safe.preview : "",
          id: typeof safe.id === "number" ? safe.id : undefined,
          altText: typeof safe.altText === "string" ? safe.altText : ""
        };
      });
    }

    // If nothing to update, fail early
    if (Object.keys(updateDoc).length === 0) {
      return next(
        errorHandler(
          400,
          "Provide images and/or canonicalTag/meta fields to update"
        )
      );
    }

    if (!isValidObjectId(req.params.id)) {
      return next(errorHandler(400, "Invalid package id"));
    }

    const add = await Add.findByIdAndUpdate(
      req.params.id,
      { $set: updateDoc },
      { new: true, runValidators: false }
    ).lean();

    if (!add) return next(errorHandler(404, "Add not found!"));

    cacheClear();
    return res.status(200).json(add);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// DELETE ADD
// --------------------------------------
export const deleteAdd = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return next(errorHandler(400, "Invalid package id"));
    }

    const result = await Add.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return next(errorHandler(404, "Add not found!"));
    }

    cacheClear();
    return res.status(200).json("Add has been deleted!");
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// DELETE MULTIPLE
// --------------------------------------
export const deleteMultipleAdds = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return next(errorHandler(400, "ids should be a non-empty array"));
    }

    const validIds = ids.filter((id) => isValidObjectId(id));
    if (validIds.length === 0) {
      return next(errorHandler(400, "No valid ids provided"));
    }

    const result = await Add.deleteMany({ _id: { $in: validIds } });

    if (result.deletedCount === 0) {
      return next(errorHandler(404, "No adds found to delete!"));
    }

    cacheClear();

    return res
      .status(200)
      .json(`Successfully deleted ${result.deletedCount} adds`);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// GET PACKAGE ONLY (FAST + LEAN + INDEX)
// --------------------------------------
export const getPackageOnly = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const cacheKey = `packageOnly_${page}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const [packages, total] = await Promise.all([
      Add.find({}, packageProjection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      getEstimatedTotal(),
    ]);

    const data = {
      packages,
      pagination: buildPagination(page, limit, total),
    };

    cacheSet(cacheKey, data);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// GET PACKAGES BY DURATION + STATE (EXACT STATE — CASE/SPACE INSENSITIVE)
// --------------------------------------
export const getPackagesByDurationAndState = async (req, res, next) => {
  try {
    const state = normalizeSearchText(req.query.state);
    const duration = (req.query.duration || "").trim().toUpperCase();

    if (!state || !duration) {
      return next(
        errorHandler(400, "Both query params are required: state and duration")
      );
    }

    const cacheKey = `package_filter_${duration}_${state.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const packages = await Add.find({
      "package.duration": duration,
      ...buildExactStateFilter(state),
    })
      .sort({ createdAt: -1 })
      .lean();

    const data = { packages };
    cacheSet(cacheKey, data);

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// SEARCH PACKAGES (INSTAGRAM-STYLE: FAST + PARTIAL + TYPO FRIENDLY)
// --------------------------------------
export const searchPackages = async (req, res, next) => {
  try {
    const q = normalizeSearchText(req.query.q || req.query.search);
    const state = normalizeSearchText(req.query.state);
    const duration = (req.query.duration || "").trim().toUpperCase();
    const limit = Math.min(
      SEARCH_MAX_LIMIT,
      Math.max(1, parseInt(req.query.limit, 10) || SEARCH_DEFAULT_LIMIT)
    );

    if (!q && !state && !duration) {
      return next(
        errorHandler(400, "Provide at least one of: q, state, or duration")
      );
    }

    if (q && q.length < SEARCH_MIN_CHARS && !state && !duration) {
      return next(
        errorHandler(
          400,
          `Search query must be at least ${SEARCH_MIN_CHARS} characters`
        )
      );
    }

    const cacheKey = `package_search_${q.toLowerCase()}_${state.toLowerCase()}_${duration}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const baseFilter = {};
    if (duration) baseFilter["package.duration"] = duration;

    const collected = [];
    const seenIds = new Set();

    const appendUnique = (rows) => {
      for (const row of rows) {
        const id = String(row._id);
        if (seenIds.has(id) || collected.length >= limit) continue;
        seenIds.add(id);
        collected.push(row);
      }
    };

    // Duration-only shortcut
    if (!q && !state && duration) {
      const rows = await Add.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      const data = { query: { duration }, packages: rows };
      cacheSet(cacheKey, data);
      return res.status(200).json(data);
    }

    // 1) Text index (weighted: packageName > state > duration), prefix wildcard
    const combinedText = [q, state].filter(Boolean).join(" ");
    const textSearch = buildWildcardTextSearch(combinedText);

    if (textSearch) {
      try {
        const textRows = stripTextScore(
          await Add.find(
            { ...baseFilter, $text: { $search: textSearch } },
            { score: { $meta: "textScore" } }
          )
            .sort({ score: { $meta: "textScore" }, createdAt: -1 })
            .limit(limit)
            .lean()
        );
        appendUnique(textRows);
      } catch (textErr) {
        // Bad $text syntax — regex fallback below still runs
        console.warn("Package text search fallback:", textErr?.message);
      }
    }

    // 2) Regex partial match (e.g. "megha" -> "Meghalaya 8days")
    if (collected.length < limit) {
      const terms = [];
      if (q && q.length >= SEARCH_MIN_CHARS) terms.push(q);
      if (
        state &&
        state.length >= SEARCH_MIN_CHARS &&
        state.toLowerCase() !== q.toLowerCase()
      ) {
        terms.push(state);
      }

      if (terms.length > 0) {
        const orConditions = terms.flatMap((term) => {
          const regex = new RegExp(escapeRegex(term), "i");
          return [
            { "package.packageName": { $regex: regex } },
            { "package.state": { $regex: regex } },
            { "package.duration": { $regex: regex } },
          ];
        });

        const regexRows = await Add.find({ ...baseFilter, $or: orConditions })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        appendUnique(regexRows);
      }
    }

    const data = {
      query: {
        ...(q && { q }),
        ...(state && { state }),
        ...(duration && { duration }),
      },
      packages: collected,
    };

    cacheSet(cacheKey, data);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// GET PACKAGES BY DURATION + STATE (PACKAGE-ONLY FIELDS — FAST)
// --------------------------------------
export const getPackagesByDurationAndStateOnly = async (req, res, next) => {
  try {
    const state = normalizeSearchText(req.query.state);
    const duration = (req.query.duration || "").trim().toUpperCase();

    if (!state || !duration) {
      return next(
        errorHandler(400, "Both query params are required: state and duration")
      );
    }

    const cacheKey = `package_filter_only_${duration}_${state.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const packages = await Add.find(
      {
        "package.duration": duration,
        ...buildExactStateFilter(state),
      },
      packageProjection
    )
      .sort({ createdAt: -1 })
      .lean();

    const data = { packages };
    cacheSet(cacheKey, data);

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const getPackagesByDurationAndStateOnlytesting = async (req, res, next) => {
  try {
    const state = normalizeSearchText(req.query.state);
    const duration = (req.query.duration || "").trim().toUpperCase();
    const pickupLocation = normalizeSearchText(req.query.pickupLocation);
    const dropLocation = normalizeSearchText(req.query.dropLocation);
    const places = parsePlacesFilter(req.query);

    if (!state || !duration) {
      return next(
        errorHandler(400, "Both query params are required: state and duration")
      );
    }

    const placesKey = places
      .map((p) => `${p.placeCover.toLowerCase()}:${p.nights ?? ""}`)
      .join("|");
    const cacheKey = `package_filter_only_testing_${duration}_${state.toLowerCase()}_${pickupLocation.toLowerCase()}_${dropLocation.toLowerCase()}_${placesKey}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const filter = {
      "package.duration": duration,
      ...buildExactStateFilter(state),
    };

    const pickupFilter = buildFlexibleExactFieldFilter(
      "package.pickupLocation",
      pickupLocation
    );
    if (pickupFilter) Object.assign(filter, pickupFilter);

    const dropFilter = buildFlexibleExactFieldFilter(
      "package.dropLocation",
      dropLocation
    );
    if (dropFilter) Object.assign(filter, dropFilter);

    const placesFilter = buildPlacesFilter(places);
    if (placesFilter) Object.assign(filter, placesFilter);

    const packages = await Add.find(filter, packageProjection)
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(3000);

    const data = {
      query: {
        state,
        duration,
        ...(pickupLocation && { pickupLocation }),
        ...(dropLocation && { dropLocation }),
        ...(places.length && { places }),
      },
      packages,
    };
    cacheSet(cacheKey, data);

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};
// --------------------------------------
// SEARCH PACKAGES (PACKAGE-ONLY FIELDS — FAST)
// --------------------------------------
export const searchPackagesOnly = async (req, res, next) => {
  try {
    const q = normalizeSearchText(req.query.q || req.query.search);
    const state = normalizeSearchText(req.query.state);
    const duration = (req.query.duration || "").trim().toUpperCase();
    const limit = Math.min(
      SEARCH_MAX_LIMIT,
      Math.max(1, parseInt(req.query.limit, 10) || SEARCH_DEFAULT_LIMIT)
    );

    if (!q && !state && !duration) {
      return next(
        errorHandler(400, "Provide at least one of: q, state, or duration")
      );
    }

    if (q && q.length < SEARCH_MIN_CHARS && !state && !duration) {
      return next(
        errorHandler(
          400,
          `Search query must be at least ${SEARCH_MIN_CHARS} characters`
        )
      );
    }

    const cacheKey = `package_search_only_${q.toLowerCase()}_${state.toLowerCase()}_${duration}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const baseFilter = {};
    if (duration) baseFilter["package.duration"] = duration;

    const collected = [];
    const seenIds = new Set();

    const appendUnique = (rows) => {
      for (const row of rows) {
        const id = String(row._id);
        if (seenIds.has(id) || collected.length >= limit) continue;
        seenIds.add(id);
        collected.push(row);
      }
    };

    if (!q && !state && duration) {
      const rows = await Add.find(baseFilter, packageProjection)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      const data = { query: { duration }, packages: rows };
      cacheSet(cacheKey, data);
      return res.status(200).json(data);
    }

    const combinedText = [q, state].filter(Boolean).join(" ");
    const textSearch = buildWildcardTextSearch(combinedText);

    if (textSearch) {
      try {
        const textRows = stripTextScore(
          await Add.find(
            { ...baseFilter, $text: { $search: textSearch } },
            { ...packageProjection, score: { $meta: "textScore" } }
          )
            .sort({ score: { $meta: "textScore" }, createdAt: -1 })
            .limit(limit)
            .lean()
        );
        appendUnique(textRows);
      } catch (textErr) {
        console.warn("Package text search (only) fallback:", textErr?.message);
      }
    }

    if (collected.length < limit) {
      const terms = [];
      if (q && q.length >= SEARCH_MIN_CHARS) terms.push(q);
      if (
        state &&
        state.length >= SEARCH_MIN_CHARS &&
        state.toLowerCase() !== q.toLowerCase()
      ) {
        terms.push(state);
      }

      if (terms.length > 0) {
        const orConditions = terms.flatMap((term) => {
          const regex = new RegExp(escapeRegex(term), "i");
          return [
            { "package.packageName": { $regex: regex } },
            { "package.state": { $regex: regex } },
            { "package.duration": { $regex: regex } },
          ];
        });

        const regexRows = await Add.find(
          { ...baseFilter, $or: orConditions },
          packageProjection
        )
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        appendUnique(regexRows);
      }
    }

    const data = {
      query: {
        ...(q && { q }),
        ...(state && { state }),
        ...(duration && { duration }),
      },
      packages: collected,
    };

    cacheSet(cacheKey, data);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};
