import express from 'express';
import {
  createSeoListing,
  getAllSeoListings,
  getSeoListingById,
  getSeoListingBySlug,
  getSeoListingsByLocationType,
  getSeoListingsByCategoryAndLocationType,
  getSeoListingsForSitemap,
  updateSeoListing,
  deleteSeoListing
} from '../controllers/seoListing.controller.js';

const router = express.Router();

router.post('/create', createSeoListing);
router.get('/all', getAllSeoListings);
router.get('/sitemap', getSeoListingsForSitemap);
router.get('/id/:id', getSeoListingById);
router.get('/slug/:slug', getSeoListingBySlug);
router.get('/type/:locationType', getSeoListingsByLocationType);
router.get('/:category/:locationType', getSeoListingsByCategoryAndLocationType);
router.put('/update/:id', updateSeoListing);
router.delete('/delete/:id', deleteSeoListing);

export default router;
