import Property from '../models/Property.model.js';

export const getCitiesWithHotels = async (req, res) => {
  try {
    // Fetch all properties and group them by city
    const properties = await Property.find({}, { location: 1, basicInfo: 1 }); // Adjust projection as needed

    const citiesWithHotels = properties.reduce((acc, property) => {
      const city = property.location.city;
      if (!acc[city]) {
        acc[city] = {
          city: city,
          hotels: []
        };
      }
      acc[city].hotels.push({
        name: property.basicInfo.propertyName,
        id: property._id,
        // Add other hotel details as needed
      });
      return acc;
    }, {});

    // Convert the object to an array
    const result = Object.values(citiesWithHotels);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}; 
