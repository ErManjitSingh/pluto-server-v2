import express from 'express';
import { 
  createAdd, 
  getAdds, 
  getAdd, 
  updateAdd, 
  updateAddMediaAndCanonical,
  deleteAdd,
  deleteMultipleAdds,
  getPackageOnly,
  getPackageNameAndId,
  getPackagesByDurationAndState,
  getPackagesByDurationAndStateOnly,
  searchPackages,
  getPackagesByDurationAndStateOnlytesting,
  searchPackagesOnly,
  migratePackageSignatures,
  getPackageTypes,
  getPackageThemes,
  getPackageTags,
  getPackagesByStateSlim,
  getPackagesByTheme,
  getPackagesByPackageType,
  getPackagesByTag
} from '../controllers/add.controller.js';

const router = express.Router();

router.post('/create', createAdd);
router.post('/migrate-signatures', migratePackageSignatures);
router.get('/get', getAdds);
router.get('/get/:id', getAdd);
router.get('/packages', getPackageOnly);
router.get('/packages/names', getPackageNameAndId);
router.get('/packages/types', getPackageTypes);
router.get('/packages/themes', getPackageThemes);
router.get('/packages/tags', getPackageTags);
router.get('/packages/by-state', getPackagesByStateSlim);
router.get('/packages/by-theme', getPackagesByTheme);
router.get('/packages/by-type', getPackagesByPackageType);
router.get('/packages/by-tag', getPackagesByTag);
router.get('/packages/filter', getPackagesByDurationAndState);
router.get('/packages/filter-only', getPackagesByDurationAndStateOnly);
router.get('/packages/search', searchPackages);
router.get('/packages/search-only', searchPackagesOnly);
router.get('/packages/filter-only-testing', getPackagesByDurationAndStateOnlytesting);
router.put('/update/:id', updateAdd);
router.put('/update-media/:id', updateAddMediaAndCanonical);
router.delete('/delete/:id', deleteAdd);
router.delete('/delete-multiple', deleteMultipleAdds);

export default router;
