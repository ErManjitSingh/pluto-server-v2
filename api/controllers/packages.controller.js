import Packages from "../models/packages.model.js";

export const createPackage = async (req, res, next) => {
  try {
      console.log("Request Body:", req.body); // Log the request body to check structure

      // Create the package and get the resulting document
      const packages = await Packages.create(req.body);

      // Customize the response to include specific fields along with the packageId
      const response = {
          packageId: packages._id, // Add the package ID here
          pickupLocation: packages.pickupLocation,
          packagePlaces: packages.packagePlaces,
          dropLocation: packages.dropLocation,
          duration: packages.duration,
          step: 1
      };

      return res.status(200).json(response);
  } catch (error) {
      console.error("Error in createPackage:", error); // Log the error for debugging
      next(error);
  }
};


// New function to update travelPrices in the second step
export const updateTravelPrices = async (req, res, next) => {
  try {
      const { packageId } = req.params;
      const { travelPrices } = req.body;

      if (!travelPrices || typeof travelPrices !== 'object') {
          return res.status(400).json({ message: "Invalid travelPrices data" });
      }

      const updatedPackage = await Packages.findByIdAndUpdate(
          packageId,
          { travelPrices },
          { new: true, runValidators: true }
      );

      if (!updatedPackage) {
          return res.status(404).json({ message: "Package not found" });
      }

      return res.status(200).json(updatedPackage);
  } catch (error) {
      console.error("Error in updateTravelPrices:", error); // Log the error for debugging
      next(error);
  }
};



export const getPackages = async (req, res, next) => {
  try {

    const type = req.query.type;
    // Define a filter object based on the type parameter
    const filter = type ? { type } : {};

      const packages = await Packages.find(filter);
      return res.status(200).json(packages);
    } catch (error) {
      next(error);
    }
  };


export const getPackageById = async (req, res, next) => {
  try {
    const { packageId } = req.params;
    const packageData = await Packages.findById(packageId);
    return res.status(200).json(packageData);
  } catch (error) {
    next(error);
  }
};

export const updatePackageHotels = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { selectedHotels } = req.body;
    console.log(selectedHotels);

    if (!Array.isArray(selectedHotels)) {
      return res.status(400).json({
        success: false,
        message: 'Selected hotels must be an array'
      });
    }

    const updatedPackage = await Packages.findByIdAndUpdate(
      id,
      { $set: { hotels: selectedHotels } },
      { new: true }
    );

    if (!updatedPackage) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Hotels updated successfully',
      data: updatedPackage
    });
  } catch (error) {
    next(error);
  }
};

export const updatePackageData = async (req, res, next) => {
  try {
    const { id } = req.params;
    const packageData = req.body;

    // Validate the required fields
    if (!packageData) {
      return res.status(400).json({
        success: false,
        message: 'Package data is required'
      });
    }

    // Update only the package data fields
    const updatedPackage = await Packages.findByIdAndUpdate(
      id,
      { 
        $set: {
          packageType: packageData.packageType,
          packageCategory: packageData.packageCategory,
          packageName: packageData.packageName,
          packageImages: packageData.packageImages,
          priceTag: packageData.priceTag,
          duration: packageData.duration,
          status: packageData.status,
          displayOrder: packageData.displayOrder,
          hotelCategory: packageData.hotelCategory,
          pickupLocation: packageData.pickupLocation,
          pickupTransfer: packageData.pickupTransfer,
          dropLocation: packageData.dropLocation,
          validTill: packageData.validTill,
          tourBy: packageData.tourBy,
          agentPackage: packageData.agentPackage,
          customizablePackage: packageData.customizablePackage,
          packagePlaces: packageData.packagePlaces,
          themes: packageData.themes,
          tags: packageData.tags,
          amenities: packageData.amenities,
          initialAmount: packageData.initialAmount,
          defaultHotelPackage: packageData.defaultHotelPackage,
          defaultVehicle: packageData.defaultVehicle,
          packageDescription: packageData.packageDescription,
          packageInclusions: packageData.packageInclusions,
          packageExclusions: packageData.packageExclusions,
          itineraryDays: packageData.itineraryDays,
          updatedAt: new Date()
        } 
      },
      { new: true }
    );

    if (!updatedPackage) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Return a success response with necessary data for next steps
    res.status(200).json({
      success: true,
      message: 'Package data updated successfully',
      package: {
        _id: updatedPackage._id,
        pickupLocation: updatedPackage.pickupLocation,
        dropLocation: updatedPackage.dropLocation,
        packagePlaces: updatedPackage.packagePlaces,
        duration: updatedPackage.duration
      }
    });
  } catch (error) {
    next(error);
  }
};

 export const deletePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    
   const deletedPackage = await Packages.findByIdAndDelete(id);
    
    if (!deletedPackage) {
     return res.status(404).json({
        success: false,
       message: 'Package not found'
      });
     }

    res.status(200).json({
      success: true,
      message: 'Package deleted successfully'
     });
   } catch (error) {
     next(error);
   }
 };
