import Gallery from '../models/gallery.model.js';

// Get all gallery images
export const getGalleryImagesHandler = async (req, res) => {
    try {
        const gallery = await Gallery.findOne(); // Assuming there's only one document for the gallery
        res.json(gallery ? gallery.images : []);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching images', error });
    }
};

// Upload an image
export const uploadImageHandler = async (req, res) => {
    const { imageUrl } = req.body; // Assuming the image URL is sent in the request body
    if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
    }

    try {
        let gallery = await Gallery.findOne();
        if (!gallery) {
            gallery = new Gallery({ images: [] });
        }
        gallery.images.push(imageUrl);
        await gallery.save();
        res.status(201).json({ message: 'Image added successfully', imageUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error adding image', error });
    }
};

// Delete an image
export const deleteImageHandler = async (req, res) => {
    const { imageUrl } = req.body; // Assuming the image URL is sent in the request body
    if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
    }

    try {
        const gallery = await Gallery.findOne();
        if (gallery) {
            gallery.images = gallery.images.filter(image => image !== imageUrl);
            await gallery.save();
            res.status(200).json({ message: 'Image deleted successfully', imageUrl });
        } else {
            res.status(404).json({ message: 'Gallery not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error deleting image', error });
    }
};
