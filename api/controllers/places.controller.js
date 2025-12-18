import Place from "../models/places.model.js";
import https from "https";


// Get all places for a city
export const getPlaces = async (req, res) => {
    try {
      const { country, state, city } = req.params;
      const places = await Place.find({ country, stateName: state, city: city });
      console.log(places)
      res.json(places);
    } catch (error) {
      console.error("Error fetching places:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  
  // Add a new place
  export const addPlace = async (req, res) => {
    try {
      const { country, state, city } = req.params;
      const newPlaceData = { ...req.body, country, stateName: state, city };
      const newPlace = await Place.create(newPlaceData);
      res.json(newPlace);
    } catch (error) {
      console.error("Error adding place:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  
  // Edit an existing place
  export const editPlace = async (req, res) => {
    try {
      const { placeId } = req.params;
      const updatedPlace = await Place.findByIdAndUpdate(
        placeId,
        req.body,
        { new: true }
      );
      res.json(updatedPlace);
    } catch (error) {
      console.error("Error editing place:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  
  // Delete a place
  export const deletePlace = async (req, res) => {
    try {
      const { placeId } = req.params;
      await Place.findByIdAndDelete(placeId);
      res.json({ message: "Place deleted successfully" });
    } catch (error) {
      console.error("Error deleting place:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };

  export const getAllPlaces = async (req, res) => {
    try {
      const { country, city } = req.params;
      const places = await Place.find({ country, city: city });
      console.log(places)
      res.json(places);
    } catch (error) {
      console.error("Error fetching places:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  

  export const searchPlaces = async (req, res) => {
    try {
      const { search } = req.query; // Extract search query from request

      console.log(search);
      
      // Define search criteria
      const searchCriteria = {
        placeName: { $regex: new RegExp(search, 'i') } // Case-insensitive search for placeName
      };
  
      const places = await Place.find(searchCriteria);
      res.json(places);
    } catch (error) {
      console.error("Error fetching places:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
};

export const fetchAllPlaces = async (req, res) => {
  try {
    const places = await Place.find({});
    res.json(places);
  } catch (error) {
    console.error("Error fetching all places:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get Google Reviews for a place
export const getGoogleReviews = async (req, res) => {
  try {
    const { placeId } = req.params;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    // Validate placeId
    if (!placeId) {
      return res.status(400).json({ error: "Place ID is required" });
    }

    // Validate API key
    if (!apiKey) {
      return res.status(500).json({ 
        error: "Google Places API key is not configured. Please set GOOGLE_PLACES_API_KEY in your environment variables." 
      });
    }

    // Construct the API URL - Request more comprehensive fields including photos
    const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total,name,formatted_address,photos&key=${apiKey}`;

    // Fetch reviews from Google Places API using https module
    const data = await new Promise((resolve, reject) => {
      https.get(apiUrl, (response) => {
        let data = '';

        // A chunk of data has been received
        response.on('data', (chunk) => {
          data += chunk;
        });

        // The whole response has been received
        response.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            resolve(parsedData);
          } catch (parseError) {
            reject(new Error('Failed to parse response: ' + parseError.message));
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });

    // Log the raw response for debugging (optional - remove in production)
    console.log('Google Places API Response Status:', data.status);
    if (data.result) {
      console.log('Place Name:', data.result.name);
      console.log('Has Reviews:', !!data.result.reviews);
      console.log('Reviews Count:', data.result.reviews?.length || 0);
      // Log first review structure to check for photos
      if (data.result.reviews && data.result.reviews.length > 0) {
        console.log('First Review Structure:', JSON.stringify(data.result.reviews[0], null, 2));
      }
    }

    // Check if the API request was successful
    if (data.status === 'OK' && data.result) {
      const { reviews, rating, user_ratings_total, name, formatted_address, photos } = data.result;
      
      // Process reviews to extract photo information if available
      const processedReviews = reviews ? reviews.map(review => {
        const reviewData = {
          author_name: review.author_name,
          author_url: review.author_url,
          language: review.language,
          original_language: review.original_language,
          profile_photo_url: review.profile_photo_url,
          rating: review.rating,
          relative_time_description: review.relative_time_description,
          text: review.text,
          time: review.time,
          translated: review.translated
        };

        // Include photos if they exist in the review
        if (review.photos && review.photos.length > 0) {
          reviewData.photos = review.photos.map(photo => ({
            height: photo.height,
            width: photo.width,
            photo_reference: photo.photo_reference,
            // Generate photo URL using photo_reference
            photo_url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${apiKey}`
          }));
        }

        return reviewData;
      }) : [];
      
      // Process place photos (may include user-contributed photos)
      const placePhotos = photos ? photos.map(photo => ({
        height: photo.height,
        width: photo.width,
        photo_reference: photo.photo_reference,
        photo_url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photo.photo_reference}&key=${apiKey}`
      })) : [];
      
      // Return comprehensive response including place details
      res.json({
        success: true,
        placeId,
        placeName: name || null,
        address: formatted_address || null,
        rating: rating !== undefined ? rating : null,
        user_ratings_total: user_ratings_total || 0,
        reviews: processedReviews,
        total_reviews: processedReviews.length,
        placePhotos: placePhotos, // Photos associated with the place (may include user-contributed)
        // Include raw status for debugging
        apiStatus: data.status
      });
    } else if (data.status === 'ZERO_RESULTS') {
      res.status(404).json({
        success: false,
        error: 'Place not found with the provided Place ID',
        status: data.status
      });
    } else {
      // Handle API errors
      res.status(400).json({
        success: false,
        error: data.error_message || 'Failed to fetch reviews',
        status: data.status
      });
    }
  } catch (error) {
    console.error("Error fetching Google reviews:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      message: error.message 
    });
  }
};
