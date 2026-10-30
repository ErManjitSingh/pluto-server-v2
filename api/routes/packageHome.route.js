import express from 'express';
import {
  createPackageHome,
  getPackageHome,
  updatePackageHome,
} from '../controllers/packageHome.controller.js';

const router = express.Router();

// The package home page is a single document: create it once, then keep editing it.
router.post('/create', createPackageHome);
router.get('/get', getPackageHome);
router.put('/update/:id', updatePackageHome);
router.patch('/update/:id', updatePackageHome);

export default router;
