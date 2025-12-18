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
