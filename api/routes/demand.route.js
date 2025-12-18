import express from 'express';
import {
  createDemand,
  getAllDemands,
  getDemandById,
  getDemandBySlug,
  updateDemand,
  deleteDemand,
  getDemandsByTheme
} from '../controllers/demand.controller.js';

const router = express.Router();

// Create a new demand (POST)
router.post('/create', createDemand);

// Get all demands with filtering and pagination (GET)
router.get('/all', getAllDemands);

// Get demand by ID (GET)
router.get('/id/:id', getDemandById);

// Get demand by slug (GET)
router.get('/slug/:slug', getDemandBySlug);

// Get demands by theme (GET)
router.get('/theme/:theme', getDemandsByTheme);

// Update a demand (PUT)
router.put('/update/:id', updateDemand);

// Delete a demand (DELETE)
router.delete('/delete/:id', deleteDemand);

export default router;
