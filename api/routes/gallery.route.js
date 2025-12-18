import express from 'express';
import { getGalleryImagesHandler, uploadImageHandler, deleteImageHandler } from '../controllers/gallery.controller.js';

const router = express.Router();

// Route to get gallery images
router.get('/get-all-images', getGalleryImagesHandler);

// Route to upload an image
router.post('/upload', uploadImageHandler);

// Route to delete an image
router.delete('/delete', deleteImageHandler);

export default router;
