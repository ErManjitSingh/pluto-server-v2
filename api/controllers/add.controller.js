import mongoose from "mongoose";
import Add from "../models/add.model.js";
import { errorHandler } from "../utils/error.js";

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
    const add = await Add.create(req.body);
    cacheClear();
    return res.status(201).json(add.toObject ? add.toObject() : add);
  } catch (error) {
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

    const add = await Add.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: false,
    }).lean();

    if (!add) return next(errorHandler(404, "Add not found!"));

    cacheClear();
    return res.status(200).json(add);
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
// GET PACKAGES BY DURATION + STATE (FAST + TYPO FRIENDLY)
// --------------------------------------
export const getPackagesByDurationAndState = async (req, res, next) => {
  try {
    const state = (req.query.state || "").trim().replace(/\s+/g, " ");
    const duration = (req.query.duration || "").trim().toUpperCase();

    if (!state || !duration) {
      return next(
        errorHandler(400, "Both query params are required: state and duration")
      );
    }

    const cacheKey = `package_filter_${duration}_${state.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const rows = await Add.find(
      {
        "package.duration": duration,
        $text: { $search: state },
      },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .lean();

    const packages = stripTextScore(rows);

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
    const state = (req.query.state || "").trim().replace(/\s+/g, " ");
    const duration = (req.query.duration || "").trim().toUpperCase();

    if (!state || !duration) {
      return next(
        errorHandler(400, "Both query params are required: state and duration")
      );
    }

    const cacheKey = `package_filter_only_${duration}_${state.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    const rows = await Add.find(
      {
        "package.duration": duration,
        $text: { $search: state },
      },
      { ...packageProjection, score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .lean();

    const data = { packages: stripTextScore(rows) };
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
