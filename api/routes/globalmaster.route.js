import express from 'express';
import {
  createGlobalMaster,
  getAllGlobalMaster,
  getGlobalMasterById,
  updateGlobalMaster,
  deleteGlobalMaster,
  bulkCreateGlobalMaster
} from '../controllers/globalmaster.controller.js';

const router = express.Router();

// Create a new global master entry
router.post('/create', createGlobalMaster);

// Get all global master entries
router.get('/getall', getAllGlobalMaster);

// Get a single global master entry by ID
router.get('/get/:id', getGlobalMasterById);

// Update a global master entry
router.put('/update/:id', updateGlobalMaster);

// Delete a global master entry
router.delete('/delete/:id', deleteGlobalMaster);

// Bulk create global master entries
router.post('/bulk-create', bulkCreateGlobalMaster);

export default router;
