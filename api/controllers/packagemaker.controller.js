import Property from "../models/packagemaker.model.js";
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';


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
        // Ensure step is set to 3 for rooms data
        const roomsData = { ...data, step: 3 };
        updatedProperty = await updateOrCreateProperty(propertyId, { rooms: roomsData });
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
    // For updates, we need to handle password generation manually since findByIdAndUpdate doesn't trigger pre-save hooks
    if (updateData.basicInfo && updateData.basicInfo.mobile) {
      // If password is not provided or empty, automatically set it to mobile number
      if (!updateData.basicInfo.password || 
          (typeof updateData.basicInfo.password === 'string' && updateData.basicInfo.password.trim().length === 0)) {
        updateData.basicInfo.password = updateData.basicInfo.mobile;
        // Hash the password
        updateData.basicInfo.password = await bcryptjs.hash(updateData.basicInfo.password, 10);
      } else {
        // If password is explicitly provided, hash it if not already hashed
        if (typeof updateData.basicInfo.password === 'string' && 
            !updateData.basicInfo.password.startsWith('$2a$') && 
            !updateData.basicInfo.password.startsWith('$2b$') && 
            !updateData.basicInfo.password.startsWith('$2y$')) {
          updateData.basicInfo.password = await bcryptjs.hash(updateData.basicInfo.password, 10);
        }
      }
    }
    return await Property.findByIdAndUpdate(propertyId, { $set: updateData }, { new: true });
  } else {
    // For new properties, pre-save middleware will handle password generation and hashing
    return await Property.create(updateData);
  }
};


export const getProperties = async (req, res) => {
  try {
    // Extract pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalProperties = await Property.countDocuments();

    // Retrieve properties with pagination
    const properties = await Property.find()
      .skip(skip)
      .limit(limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalProperties / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Return the list of properties with pagination info
    res.status(200).json({
      success: true,
      data: properties,
      pagination: {
        currentPage: page,
        totalPages,
        totalProperties,
        hasNextPage,
        hasPrevPage,
        limit
      }
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
    // Updated query to include inventory in the projection
    const hotels = await Property.find(
      { "location.city": cityName },
      { basicInfo: 1, photosAndVideos: 1, rooms: 1, inventory: 1, numberOfNightsBooked: 1 } // Added inventory to the projection
    );

    // Check if any hotels were found
    if (hotels.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No hotels found in city: ${cityName}`,
      });
    }

    // Return the hotels with basicInfo, photosAndVideos, rooms, and inventory
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

// Add this new function to handle package deletion
export const getBasicPropertyInfo = async (req, res) => {
  const { id: propertyId } = req.params;

  try {
    // Find the property by ID and select only basicInfo, location, and photosAndVideos
    const property = await Property.findById(propertyId, {
      basicInfo: 1,
      location: 1,
      photosAndVideos: 1,
      numberOfNightsBooked: 1
    });

    // If property not found, return an error response
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    // Return the basic property info
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

export const getAllBasicPropertyInfo = async (req, res) => {
  try {
    // Extract pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 400;
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalProperties = await Property.countDocuments();

    // Retrieve all properties with only basicInfo, location, and photosAndVideos
    const properties = await Property.find({}, {
      basicInfo: 1,
      location: 1,
      photosAndVideos: 1
    })
      .skip(skip)
      .limit(limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalProperties / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Return the list of properties with pagination info
    res.status(200).json({
      success: true,
      data: properties,
      pagination: {
        currentPage: page,
        totalPages,
        totalProperties,
        hasNextPage,
        hasPrevPage,
        limit
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePackageMaker = async (req, res) => {
  const { id: packageId } = req.params;

  try {
    // Find and delete the package by ID
    const deletedPackage = await Property.findByIdAndDelete(packageId);

    // If package not found, return an error response
    if (!deletedPackage) {
      return res.status(404).json({ 
        success: false, 
        message: "Package not found" 
      });
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: "Package deleted successfully"
    });
  } catch (error) {
    // Handle errors and send error response
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const loginPackageMaker = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    // Validate input
    if (!mobile || !password) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and password are required"
      });
    }

    // Find property by mobile number
    // Note: We need to explicitly select password field since it's marked as select: false in schema
    const property = await Property.findOne({ "basicInfo.mobile": mobile })
      .select("+basicInfo.password");

    // If property not found
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "No account found with this mobile number"
      });
    }

    // Handle password verification and auto-generation for existing properties
    let validPassword = false;
    
    // If password doesn't exist, create it from mobile number
    if (!property.basicInfo.password) {
      // Auto-generate password from mobile if it doesn't exist (backward compatibility)
      property.basicInfo.password = await bcryptjs.hash(property.basicInfo.mobile, 10);
      await property.save();
      // Since we just created it, check if provided password matches mobile
      validPassword = (password === property.basicInfo.mobile);
    } else {
      // Verify password
      validPassword = bcryptjs.compareSync(password, property.basicInfo.password);
      
      // If password doesn't match, check if the entered password is the mobile number
      // This handles existing properties that might have different passwords
      if (!validPassword && password === property.basicInfo.mobile) {
        // Update password to mobile number for existing properties
        property.basicInfo.password = await bcryptjs.hash(property.basicInfo.mobile, 10);
        await property.save();
        validPassword = true;
      }
    }

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid password. Please use your mobile number as the password."
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: property._id,
        mobile: property.basicInfo.mobile,
        isPackageMaker: true 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Remove password from response
    const propertyData = property.toObject();
    delete propertyData.basicInfo.password;

    // Return success response
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        property: propertyData,
        token: token
      }
    });
  } catch (error) {
    // Handle errors and send error response
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
