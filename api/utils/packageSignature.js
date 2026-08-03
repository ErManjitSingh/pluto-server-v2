import Add from "../models/add.model.js";
import approval from "../models/packageApproval.model.js";

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

export const findDuplicatePackageAnywhere = async (
  uniqueSignature,
  { excludeAddId = null, excludeApprovalId = null } = {}
) => {
  if (!uniqueSignature) return null;

  const addQuery = { uniqueSignature };
  const approvalQuery = { uniqueSignature };

  if (excludeAddId) addQuery._id = { $ne: excludeAddId };
  if (excludeApprovalId) approvalQuery._id = { $ne: excludeApprovalId };

  const [existingAdd, existingApproval] = await Promise.all([
    Add.findOne(addQuery).select("_id package.packageName").lean(),
    approval.findOne(approvalQuery).select("_id package.packageName").lean(),
  ]);

  if (existingAdd) {
    return {
      id: existingAdd._id,
      packageName: existingAdd.package?.packageName || "Unknown",
      source: "package",
    };
  }

  if (existingApproval) {
    return {
      id: existingApproval._id,
      packageName: existingApproval.package?.packageName || "Unknown",
      source: "approval",
    };
  }

  return null;
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
