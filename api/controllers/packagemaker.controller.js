import Property from "../models/packagemaker.model.js";
import WebsitePartner from "../models/websitepartner.model.js";
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function isBcryptHash(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$'))
  );
}

/** Root website-partner fields — must not go inside basicInfo/location/etc. */
function extractWebsitePartnerRootFields(data = {}) {
  const root = {};
  const stepData = { ...data };

  if (stepData.isWebsiteHotel === true || stepData.isWebsiteHotel === 'true') {
    root.isWebsiteHotel = true;
  }
  delete stepData.isWebsiteHotel;

  const partnerId =
    stepData.websitePartnerId ||
    stepData.websitePartner?._id ||
    stepData.websitePartner?.id ||
    null;
  if (partnerId && mongoose.Types.ObjectId.isValid(String(partnerId))) {
    root.websitePartnerId = partnerId;
    root.isWebsiteHotel = true;
  }
  delete stepData.websitePartnerId;
  delete stepData.websitePartner;
  delete stepData.partnerName;
  delete stepData.partnerEmail;
  delete stepData.partnerMobile;

  // Partner "name" is not basicInfo.propertyName
  if (Object.prototype.hasOwnProperty.call(stepData, 'name')) {
    delete stepData.name;
  }

  return { root, stepData };
}

async function linkWebsitePartnerToProperty(partnerId, propertyId) {
  if (!partnerId || !propertyId) return;
  if (!mongoose.Types.ObjectId.isValid(String(partnerId))) return;

  await WebsitePartner.findByIdAndUpdate(partnerId, {
    $set: { packageMakerId: propertyId },
  });
}

function signPackageMakerToken(property) {
  const payload = {
    id: property._id,
    isPackageMaker: true,
    mobile: property.basicInfo?.mobile,
  };

  if (property.isWebsiteHotel) {
    payload.isWebsiteHotel = true;
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function sanitizePropertyResponse(propertyDoc) {
  const propertyData = propertyDoc.toObject ? propertyDoc.toObject() : { ...propertyDoc };
  if (propertyData.basicInfo) delete propertyData.basicInfo.password;
  return propertyData;
}

const HOTEL_PI_PROJECTION = {
  basicInfo: 1,
  location: 1,
  photosAndVideos: 1,
  amenities: 1,
  rooms: 1,
};

function collapseWhitespace(str) {
  if (!str || typeof str !== "string") return "";
  return str.trim().replace(/\s+/g, " ");
}

function normalizeLocationKey(str) {
  return collapseWhitespace(str).toLowerCase();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLocationRegex(name) {
  const collapsed = collapseWhitespace(name);
  if (!collapsed) return null;
  const pattern = escapeRegex(collapsed).replace(/\s+/g, "\\s+");
  return new RegExp(`^${pattern}$`, "i");
}

function dedupeLocationValues(rawValues) {
  const groups = new Map();

  for (const raw of rawValues) {
    const collapsed = collapseWhitespace(raw);
    if (!collapsed) continue;

    const key = normalizeLocationKey(collapsed);
    if (!groups.has(key)) {
      groups.set(key, new Map());
    }

    const variants = groups.get(key);
    variants.set(collapsed, (variants.get(collapsed) || 0) + 1);
  }

  const result = [];
  for (const variants of groups.values()) {
    let bestDisplay = "";
    let bestCount = -1;

    for (const [display, count] of variants) {
      if (
        count > bestCount ||
        (count === bestCount && display.localeCompare(bestDisplay, undefined, { sensitivity: "base" }) < 0)
      ) {
        bestCount = count;
        bestDisplay = display;
      }
    }

    result.push(bestDisplay);
  }

  return result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function getDistinctNormalizedLocations(fieldPath) {
  const values = await Property.distinct(fieldPath, {
    [fieldPath]: { $exists: true, $nin: [null, ""] },
  });
  return dedupeLocationValues(values);
}

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
  const { step, ...rawData } = req.body;
  const propertyId = req.params.id;

  try {
    const { root: websiteRoot, stepData: data } = extractWebsitePartnerRootFields(rawData);
    let updatedProperty;

    switch (step) {
      case 0:  // Basic Info
        updatedProperty = await updateOrCreateProperty(propertyId, {
          basicInfo: data,
          ...websiteRoot,
        });
        break;

      case 1:  // Location
        updatedProperty = await updateOrCreateProperty(propertyId, {
          location: data,
          ...websiteRoot,
        });
        break;

      case 2:  // Amenities
        updatedProperty = await updateOrCreateProperty(propertyId, {
          amenities: data,
          ...websiteRoot,
        });
        break;

      case 3:  // Rooms
        const roomsData = { ...data, step: 3 };
        updatedProperty = await updateOrCreateProperty(propertyId, {
          rooms: roomsData,
          ...websiteRoot,
        });
        break;

      case 4:  // Photos and Videos
        updatedProperty = await updateOrCreateProperty(propertyId, {
          photosAndVideos: data,
          ...websiteRoot,
        });
        break;

      case 5:  // Policies
        updatedProperty = await updateOrCreateProperty(propertyId, {
          policies: data,
          ...websiteRoot,
        });
        break;

      case 6:  // Finance & Legal
        updatedProperty = await updateOrCreateProperty(propertyId, {
          financeAndLegal: data,
          ...websiteRoot,
        });
        break;

      case 7: // Inventory & Rates
        const sanitizedData = sanitizeInventoryData(req.body);
        updatedProperty = await updateOrCreateProperty(propertyId, {
          inventory: sanitizedData,
          ...websiteRoot,
        });
        break;
      default:
        return res.status(400).json({ success: false, step: step, message: "Invalid step" });
    }

    // Website partner create/update: keep WebsitePartner.packageMakerId in sync
    if (
      updatedProperty?._id &&
      (updatedProperty.isWebsiteHotel === true || websiteRoot.isWebsiteHotel === true) &&
      (updatedProperty.websitePartnerId || websiteRoot.websitePartnerId)
    ) {
      await linkWebsitePartnerToProperty(
        updatedProperty.websitePartnerId || websiteRoot.websitePartnerId,
        updatedProperty._id
      );
    }

    if (propertyId && !updatedProperty) {
      return res.status(404).json({
        success: false,
        message: "Property not found for update",
      });
    }

    res.status(200).json({ success: true, data: updatedProperty });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrCreateProperty = async (propertyId, updateData) => {
  if (propertyId) {
    const existing = await Property.findById(propertyId).select(
      'isWebsiteHotel websitePartnerId'
    );
    const isWebsiteHotel =
      existing?.isWebsiteHotel === true || updateData.isWebsiteHotel === true;

    // Keep / apply website hotel markers when partner updates their property
    if (isWebsiteHotel) {
      updateData = {
        ...updateData,
        isWebsiteHotel: true,
        websitePartnerId:
          updateData.websitePartnerId || existing?.websitePartnerId || undefined,
      };
    }

    // Website hotels: never auto-set basicInfo password from mobile
    if (!isWebsiteHotel && updateData.basicInfo && updateData.basicInfo.mobile) {
      if (!updateData.basicInfo.password || 
          (typeof updateData.basicInfo.password === 'string' && updateData.basicInfo.password.trim().length === 0)) {
        updateData.basicInfo.password = updateData.basicInfo.mobile;
        updateData.basicInfo.password = await bcryptjs.hash(updateData.basicInfo.password, 10);
      } else {
        if (typeof updateData.basicInfo.password === 'string' && !isBcryptHash(updateData.basicInfo.password)) {
          updateData.basicInfo.password = await bcryptjs.hash(updateData.basicInfo.password, 10);
        }
      }
    }
    return await Property.findByIdAndUpdate(propertyId, { $set: updateData }, { new: true });
  } else {
    // Create: website flags only when explicitly sent (website partner flow)
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

export const getAllHotelStates = async (req, res) => {
  try {
    const states = await getDistinctNormalizedLocations("location.state");

    res.status(200).json({
      success: true,
      data: states,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAllHotelCities = async (req, res) => {
  try {
    const cities = await getDistinctNormalizedLocations("location.city");

    res.status(200).json({
      success: true,
      data: cities,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getHotelsByState = async (req, res) => {
  const { stateName } = req.params;

  try {
    const regex = buildLocationRegex(stateName);
    if (!regex) {
      return res.status(400).json({
        success: false,
        message: "State name is required",
      });
    }

    const hotels = await Property.find(
      { "location.state": { $regex: regex } },
      HOTEL_PI_PROJECTION
    );

    if (hotels.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No hotels found in state: ${stateName}`,
      });
    }

    res.status(200).json({
      success: true,
      data: hotels,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getHotelsByCityPi = async (req, res) => {
  const { cityName } = req.params;

  try {
    const regex = buildLocationRegex(cityName);
    if (!regex) {
      return res.status(400).json({
        success: false,
        message: "City name is required",
      });
    }

    const hotels = await Property.find(
      { "location.city": { $regex: regex } },
      HOTEL_PI_PROJECTION
    );

    if (hotels.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No hotels found in city: ${cityName}`,
      });
    }

    res.status(200).json({
      success: true,
      data: hotels,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getHotelsByPropertyType = async (req, res) => {
  const { propertyType } = req.params;

  try {
    const regex = buildLocationRegex(propertyType);
    if (!regex) {
      return res.status(400).json({
        success: false,
        message: "Property type is required",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const filter = { "basicInfo.propertyType": { $regex: regex } };

    const totalProperties = await Property.countDocuments(filter);

    const hotels = await Property.find(filter, HOTEL_PI_PROJECTION)
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalProperties / limit) || 0;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: hotels,
      pagination: {
        currentPage: page,
        totalPages,
        totalProperties,
        hasNextPage,
        hasPrevPage,
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getHotelsByPropertyTypeAndLocation = async (req, res) => {
  const { propertyType, cityName, stateName } = req.query;

  try {
    const propertyTypeRegex = buildLocationRegex(propertyType);
    if (!propertyTypeRegex) {
      return res.status(400).json({
        success: false,
        message: "Property type is required",
      });
    }

    if (!cityName && !stateName) {
      return res.status(400).json({
        success: false,
        message: "Either cityName or stateName is required",
      });
    }

    const filter = {
      "basicInfo.propertyType": { $regex: propertyTypeRegex },
    };

    if (cityName) {
      const cityRegex = buildLocationRegex(cityName);
      if (!cityRegex) {
        return res.status(400).json({
          success: false,
          message: "Invalid city name",
        });
      }
      filter["location.city"] = { $regex: cityRegex };
    }

    if (stateName) {
      const stateRegex = buildLocationRegex(stateName);
      if (!stateRegex) {
        return res.status(400).json({
          success: false,
          message: "Invalid state name",
        });
      }
      filter["location.state"] = { $regex: stateRegex };
    }

    const hotels = await Property.find(filter, HOTEL_PI_PROJECTION);

    if (hotels.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No hotels found for the given filters",
      });
    }

    res.status(200).json({
      success: true,
      data: hotels,
    });
  } catch (error) {
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

export const getPropertyNames = async (req, res) => {
  try {
    const properties = await Property.find({}, { 'basicInfo.propertyName': 1 }).lean();
    const data = properties.map((property) => ({
      _id: property._id,
      propertyName: property.basicInfo?.propertyName || '',
    }));

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
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

export const deleteAllPackageMakerPhotosAndVideos = async (req, res) => {
  try {
    const result = await Property.clearAllPhotosAndVideos();

    res.status(200).json({
      success: true,
      message: "photosAndVideos removed from all PackageMaker records",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
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
    const property = await Property.findOne({
      "basicInfo.mobile": mobile,
      isWebsiteHotel: { $ne: true },
    })
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
    const token = signPackageMakerToken(property);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        property: sanitizePropertyResponse(property),
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

