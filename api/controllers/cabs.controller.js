import Cabs from "../models/cabs.model.js";

export const createCab = async (req, res) => {
    const { cabType, cabName, cabImages, cabSeatingCapacity, cabLuggage } = req.body;
  
  
    try {
      // Check for required fields
      if (!cabType || !cabName || !cabImages || !cabSeatingCapacity || !cabLuggage) {
        return res.status(400).json({ status: "error", message: "All fields are required." });
      }
  
      const newCab = new Cabs({
        cabType,
        cabName,
        cabImages,
        cabSeatingCapacity,
        cabLuggage,
      });
  
      await newCab.save();
  
      // Count the total number of cab entries
      const count = await Cabs.countDocuments();
  
      // Send response with _id and other cab details
      res.status(201).json({
        status: "success",
        result: { ...newCab._doc, _id: newCab._id },
        count,
      });
    } catch (error) {
      res.status(500).json({ status: "error", error: "Internal Server Error" });
    }
  };
  
export const getCabsByTypes = async (req, res) => {
  const { cabType } = req.params;

  try {
    const cabs = await City.find({ cabType });

    // Count the total number of cab entries
    const count = await Cabs.countDocuments();

    res.status(201).json({ status: "success", result: cabs, count });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const editCab = async (req, res) => {
  const { cabId } = req.params;
  const { cabType, cabName, cabImages, cabSeatingCapacity, cabLuggage } = req.body;

  try {
    console.log('Attempting to edit cab with ID:', cabId);
    console.log('Update payload:', req.body);

    // Find the cab by its ID and update it with the new details
    const updatedCab = await Cabs.findByIdAndUpdate(
      cabId,
      { 
        $set: {  // Use $set operator explicitly
          cabType, 
          cabName, 
          cabImages, 
          cabSeatingCapacity, 
          cabLuggage 
        }
      },
      { 
        new: true, 
        runValidators: true 
      }
    );

    console.log('Updated cab result:', updatedCab);

    if (!updatedCab) {
      console.log('No cab found with ID:', cabId);
      return res.status(404).json({ status: "error", message: "Cab not found" });
    }

    res.status(200).json({ status: "success", result: updatedCab });
  } catch (error) {
    console.error('Error updating cab:', error);
    res.status(500).json({ 
      status: "error", 
      message: "Internal Server Error",
      details: error.message 
    });
  }
};
export const deleteCab = async (req, res) => {
  const { cabId } = req.params;

  try {
    // Find the cab by its ID and delete it
    const deletedCab = await Cabs.findByIdAndDelete(cabId);

    if (!deletedCab) {
      return res
        .status(404)
        .json({ status: "error", message: "Cab not found" });
    }

    res
      .status(200)
      .json({ status: "success", message: "Cab deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};

export const getAllCabs = async (req, res) => {
  try {
    // Fetch all cabs from the database
    const cabs = await Cabs.find();

    // Count the total number of cab entries
    const count = await Cabs.countDocuments();

    res.status(200).json({ status: "success", result: cabs, count });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};
export const getCabsMinimal = async (req, res) => {
  try {
    // Fetch only cabImages, cabType, and cabName from all cabs
    const cabs = await Cabs.find().select('cabImages cabType cabName');

    // Count the total number of cab entries
    const count = await Cabs.countDocuments();

    res.status(200).json({ status: "success", result: cabs, count });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};

