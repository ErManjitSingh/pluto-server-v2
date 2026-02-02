import Add from "../models/add.model.js";
import { errorHandler } from "../utils/error.js";

// --------------------------------------
// SUPER FAST IN-MEMORY CACHE
// --------------------------------------
const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 min

const cacheGet = (key) => {
  const item = cache.get(key);
  if (!item || item.expire < Date.now()) return null;
  return item.data;
};

const cacheSet = (key, data) =>
  cache.set(key, { data, expire: Date.now() + TTL });

const cacheClear = () => cache.clear();

// --------------------------------------
// CREATE ADD
// --------------------------------------
export const createAdd = async (req, res, next) => {
  try {
    const add = await Add.create(req.body);
    cacheClear(); // clear for fresh data
    return res.status(201).json(add);
  } catch (error) {
    next(error);
  }
};

// --------------------------------------
// GET ALL ADDS (FAST + CACHED)
// --------------------------------------
export const getAdds = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 400;
    const skip = (page - 1) * limit;

    const cacheKey = `adds_${page}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [adds, total] = await Promise.all([
      Add.find()
        .sort({ createdAt: -1 })   // FAST because of index
        .skip(skip)
        .limit(limit)
        .lean(),                    // FASTEST output + reduces memory
      Add.estimatedDocumentCount()  // 100x faster than countDocuments()
    ]);

    const data = {
      adds, // 🔥 FULL PACKAGE OBJECT INCLUDED (NOT REDUCED)
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      }
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
    const cacheKey = `add_${req.params.id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const add = await Add.findById(req.params.id).lean();
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
    const add = await Add.findByIdAndUpdate(req.params.id, req.body, {
      new: true
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

    const add = await Add.findByIdAndUpdate(
      req.params.id,
      { $set: updateDoc },
      { new: true, runValidators: true }
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
    const add = await Add.findByIdAndDelete(req.params.id).lean();
    if (!add) return next(errorHandler(404, "Add not found!"));

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

    if (!Array.isArray(ids)) {
      return next(errorHandler(400, "ids should be an array"));
    }

    const result = await Add.deleteMany({ _id: { $in: ids } });

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 400;
    const skip = (page - 1) * limit;

    const cacheKey = `packageOnly_${page}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const adds = await Add.find(
      {},
      {
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
        "package.tags": 1
      }
    )
      .skip(skip)
      .limit(limit)
      .lean(); // FASTEST

    const total = await Add.countDocuments();

    const data = {
      packages: adds,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    };

    cacheSet(cacheKey, data);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};
