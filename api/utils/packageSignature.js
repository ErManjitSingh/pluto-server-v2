import mongoose from "mongoose";
import Add from "../models/add.model.js";

export const generatePackageSignature = (pkg) => {
  if (!pkg) return "";

  const pickup = String(pkg.pickupLocation || "").trim().toLowerCase();
  const drop = String(pkg.dropLocation || "").trim().toLowerCase();
  const duration = String(pkg.duration || "").trim().toLowerCase();

  const places = (pkg.packagePlaces || [])
    .map((p) => ({
      place: String(p.placeCover || "").trim().toLowerCase(),
      nights: Number(p.nights || 0),
    }))
    .map((p) => `${p.place}-${p.nights}`)
    .join("|");

  return `${pickup}|${drop}|${duration}|${places}`;
};

export const findDuplicateInAdd = async (uniqueSignature, excludeAddId = null) => {
  if (!uniqueSignature) return null;

  const query = { uniqueSignature };

  if (excludeAddId && mongoose.Types.ObjectId.isValid(excludeAddId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(String(excludeAddId)) };
  }

  const existingAdd = await Add.findOne(query)
    .select("_id package.packageName")
    .lean();

  if (!existingAdd) return null;

  // Safety: never treat the package being edited as its own duplicate
  if (excludeAddId && String(existingAdd._id) === String(excludeAddId)) {
    return null;
  }

  return {
    id: existingAdd._id,
    packageName: existingAdd.package?.packageName || "Unknown",
    source: "package",
  };
};

export const buildDuplicateResponse = (existing) => ({
  success: false,
  message: "Duplicate package found",
  duplicatePackage: {
    id: existing.id,
    packageName: existing.packageName,
    source: existing.source,
  },
});
