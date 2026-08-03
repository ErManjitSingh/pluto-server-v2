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
  getPackagesByDurationAndState,
  getPackagesByDurationAndStateOnly,
  searchPackages,
  getPackagesByDurationAndStateOnlytesting,
  searchPackagesOnly,
  migratePackageSignatures
} from '../controllers/add.controller.js';

const router = express.Router();

router.post('/create', createAdd);
router.post('/migrate-signatures', migratePackageSignatures);
router.get('/get', getAdds);
router.get('/get/:id', getAdd);
router.get('/packages', getPackageOnly);
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
