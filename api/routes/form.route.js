import express from 'express';
import { submitFormHandler, getFormsHandler, deleteFormHandler } from '../controllers/form.controller.js';

const router = express.Router();

// Route to submit form
router.post('/formsubmit', submitFormHandler);

// Route to get all form submissions
router.get('/formdata', getFormsHandler);

// Route to delete form submission
router.delete('/formdata/:id', deleteFormHandler);

export default router;
