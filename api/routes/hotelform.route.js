import express from 'express';
import hotelFormController from '../controllers/hotelform.controller.js';

const router = express.Router();

// Create new hotel form
router.post('/create', hotelFormController.create);

// Get all hotel forms with filtering and pagination
router.get('/getall', hotelFormController.getAll);

// Get single hotel form
router.get('/getone/:id', hotelFormController.getOne);

// Update hotel form
router.patch('/update/:id', hotelFormController.update);

// Delete hotel form
router.delete('/delete/:id', hotelFormController.delete);

export default router;
