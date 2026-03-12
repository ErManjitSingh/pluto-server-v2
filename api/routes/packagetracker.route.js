import express from 'express';
import {
  trackDownload,
  getDownloadCounts,
  getAllPackages,
  getPackagesByDemandSetu,
  getPackagesByPluto,
  getPackagesByDateRange,
  getPackagesByTeamLeader,
  getPackageDetails,
  getPackageTrackerByLeadId,
  deletePackage,
  deleteAllPackages
} from '../controllers/packagetracker.controller.js';

const router = express.Router();

// Track a download (POST)
router.post('/track', trackDownload);

// Get download counts for a specific package (GET)
router.get('/counts/:packageId', getDownloadCounts);

// Get all packages with download counts (GET)
router.get('/packages', getAllPackages);

// Get packages by download type (GET)
router.get('/packages/demand-setu', getPackagesByDemandSetu);
router.get('/packages/pluto', getPackagesByPluto);

// Get packages by date range (GET)
router.get('/packages-by-date', getPackagesByDateRange);

// Get packages by team leader (GET)
router.get('/packages-by-team-leader', getPackagesByTeamLeader);

// Get detailed package information including download history (GET)
router.get('/package/:packageId', getPackageDetails);

// Get package tracker by leaddetails _id (GET)
router.get('/package-by-lead/:leadId', getPackageTrackerByLeadId);

// Delete a package tracker (DELETE)
router.delete('/package-delete/:packageId', deletePackage);

// Delete all package trackers (DELETE)
router.delete('/packages-delete', deleteAllPackages);

export default router;
