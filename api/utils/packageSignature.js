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
