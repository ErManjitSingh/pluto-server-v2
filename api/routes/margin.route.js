import express from 'express';
import * as marginController from '../controllers/margin.controller.js';

const router = express.Router();

// Route to create new margin
router.post('/create', marginController.createMargin);

// Route to update existing margin
router.put('/update/:state', marginController.updateMargin);

// Route to update only editDiscount for a state
router.put('/update-edit-discount/:state', marginController.updateEditDiscount);
router.put('/update-edit-discount-field/:state', marginController.updateEditDiscountField);

// Route to delete a specific editDiscount object
router.delete('/delete-edit-discount/:state', marginController.deleteEditDiscount);

// Route to get margin(s)
router.get('/get-margin', marginController.getMargin);

export default router;
