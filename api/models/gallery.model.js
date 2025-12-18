// Import necessary modules
import mongoose from "mongoose";

// Define the schema
const gallerySchema = new mongoose.Schema({
    images: {
        type: [String], // Assuming cityArea is an array of strings
        required: true
      },
});

// Create the model
const Gallery = mongoose.model('Gallery', gallerySchema);

export default Gallery;
