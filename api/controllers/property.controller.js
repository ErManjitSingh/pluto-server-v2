import Property from "../models/Property.model.js";


function sanitizeInventoryData(data) {
  const today = new Date(); // Get today's date
  for (const key in data) {
    for (const roomType in data[key]) {
      const room = data[key][roomType];

      // Sanitize availability
      room.availability = room.availability
        .filter(entry => new Date(entry.date) >= today) // Keep only entries with dates today or in the future
        .map((entry) => ({
          date: entry.date,
          available: entry.available === "" ? 0 : Number(entry.available),
          sold: Number(entry.sold),
        }));

      // Sanitize rates
      for (const rateType in room.rates) {
        for (const occupancy in room.rates[rateType]) {
          room.rates[rateType][occupancy] = room.rates[rateType][occupancy].map((rate) => {
            if (rate === null) {
              return { date: rate?.date, value: null };  // Return null if rate is null
            } else {
              return {
                date: rate?.date,
                value: rate?.value === null || rate?.value === "" ? null : Number(rate?.value), // Convert empty or null values to null
              };
            }
          });
        }
      }
    }
  }
  return data;
}


export const handleStep = async (req, res) => {
  const { step, ...data } = req.body;
  const propertyId = req.params.id;
  console.log("propertyId========>", propertyId)

  try {
    let updatedProperty;

    switch (step) {
      case 0:  // Basic Info
        updatedProperty = await updateOrCreateProperty(propertyId, { basicInfo: data });
        break;

      case 1:  // Location
        updatedProperty = await updateOrCreateProperty(propertyId, { location: data });
        break;

      case 2:  // Amenities
        updatedProperty = await updateOrCreateProperty(propertyId, { amenities: data });
        break;

      case 3:  // Rooms
        updatedProperty = await updateOrCreateProperty(propertyId, { rooms: data });
        break;

      case 4:  // Photos and Videos
        updatedProperty = await updateOrCreateProperty(propertyId, { photosAndVideos: data });
        break;

      case 5:  // Policies
        updatedProperty = await updateOrCreateProperty(propertyId, { policies: data });
        break;

      case 6:  // Finance & Legal
        updatedProperty = await updateOrCreateProperty(propertyId, { financeAndLegal: data });
        break;

      case 7: // Inventory & Rates
        const sanitizedData = sanitizeInventoryData(req.body);
        updatedProperty = await updateOrCreateProperty(propertyId, { inventory: sanitizedData });
        break;
      default:
        return res.status(400).json({ success: false, step: step, message: "Invalid step" });
    }

    res.status(200).json({ success: true, data: updatedProperty });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrCreateProperty = async (propertyId, updateData) => {

  if (propertyId) {
    return await Property.findByIdAndUpdate(propertyId, { $set: updateData }, { new: true });
  } else {
    return await Property.create(updateData);
  }
};


export const getProperties = async (req, res) => {
  try {
    // Retrieve all properties without pagination or sorting
    const properties = await Property.find();

    // Return the list of properties
    res.status(200).json({
      success: true,
      data: properties
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRoomsById = async (req, res) => {
  const { id: propertyId } = req.params;

  try {
    // Find the property by ID
    const property = await Property.findById(propertyId);

    // If property not found, return an error response
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    // Retrieve the rooms data from the property
    const rooms = property.rooms;

    // Return the rooms data
    res.status(200).json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    // Handle errors and send error response
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPropertyById = async (req, res) => {
  const { id: propertyId } = req.params;

  try {
    // Find the property by ID
    const property = await Property.findById(propertyId);

    // If property not found, return an error response
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    // Return the rooms data
    res.status(200).json({
      success: true,
      data: property,
    });
  } catch (error) {
    // Handle errors and send error response
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getHotelsByCityName = async (req, res) => {
  const { cityName } = req.params;

  try {
    // Query to find properties in the specified city, projecting only basicInfo and photosAndVideos
    const hotels = await Property.find(
      { "location.city": cityName },
      { basicInfo: 1, photosAndVideos: 1 } // Projection to include only the required fields
    );

    // Check if any hotels were found
    if (hotels.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No hotels found in city: ${cityName}`,
      });
    }

    // Return the hotels with only basicInfo and photosAndVideos
    res.status(200).json({
      success: true,
      data: hotels,
    });
  } catch (error) {
    // Handle errors and send error response
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const deleteProperty = async (req, res) => {
  const { id: propertyId } = req.params;

  try {
    // Find the property by ID first to check if it exists
    const property = await Property.findById(propertyId);

    // If property not found, return an error response
    if (!property) {
      return res.status(404).json({ 
        success: false, 
        message: "Property not found" 
      });
    }

    // Delete the property
    await Property.findByIdAndDelete(propertyId);

    // Return success response
    res.status(200).json({
      success: true,
      message: "Property deleted successfully",
      data: { id: propertyId }
    });
  } catch (error) {
    // Handle errors and send error response
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

