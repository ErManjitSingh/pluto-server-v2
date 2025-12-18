import express from 'express';
import {
  trackDownload,
  getDownloadCounts,
  getAllPackages,
  getPackageDetails,
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

// Get detailed package information including download history (GET)
router.get('/package/:packageId', getPackageDetails);

// Delete a package tracker (DELETE)
router.delete('/package-delete/:packageId', deletePackage);

// Delete all package trackers (DELETE)
router.delete('/packages-delete', deleteAllPackages);

export default router;
