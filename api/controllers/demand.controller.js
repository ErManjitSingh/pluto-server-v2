import Demand from '../models/demand.model.js';

// Create a new demand
export const createDemand = async (req, res) => {
  try {
    const demandData = req.body;
    
    // Check if slug already exists
    const existingDemand = await Demand.findOne({ slug: demandData.slug });
    if (existingDemand) {
      return res.status(400).json({ message: 'Slug already exists. Please use a unique slug.' });
    }

    const newDemand = new Demand(demandData);
    const savedDemand = await newDemand.save();
    
    res.status(201).json({
      success: true,
      data: savedDemand,
      message: 'Demand created successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get all demands with optional filtering
export const getAllDemands = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      country, 
      state, 
      city, 
      packageTheme, 
      isActive,
      search 
    } = req.query;

    // Build filter object
    const filter = {};
    if (country) filter.country = country;
    if (state) filter.state = state;
    if (city) filter.city = city;
    if (packageTheme) filter.packageTheme = packageTheme;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    // Add search functionality
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const skip = (page - 1) * limit;
    
    const demands = await Demand.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Demand.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: demands,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get a single demand by ID
export const getDemandById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const demand = await Demand.findById(id);
    
    if (!demand) {
      return res.status(404).json({ 
        success: false,
        message: 'Demand not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: demand
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get demand by slug
export const getDemandBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    
    const demand = await Demand.findOne({ slug });
    
    if (!demand) {
      return res.status(404).json({ 
        success: false,
        message: 'Demand not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: demand
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Update a demand
export const updateDemand = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // If slug is being updated, check if it already exists
    if (updateData.slug) {
      const existingDemand = await Demand.findOne({ 
        slug: updateData.slug, 
        _id: { $ne: id } 
      });
      if (existingDemand) {
        return res.status(400).json({ message: 'Slug already exists. Please use a unique slug.' });
      }
    }

    const updatedDemand = await Demand.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );

    if (!updatedDemand) {
      return res.status(404).json({ 
        success: false,
        message: 'Demand not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: updatedDemand,
      message: 'Demand updated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Delete a demand
export const deleteDemand = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedDemand = await Demand.findByIdAndDelete(id);
    
    if (!deletedDemand) {
      return res.status(404).json({ 
        success: false,
        message: 'Demand not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Demand deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get demands by theme
export const getDemandsByTheme = async (req, res) => {
  try {
    const { theme } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const demands = await Demand.find({ packageTheme: theme, isActive: true })
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Demand.countDocuments({ packageTheme: theme, isActive: true });

    res.status(200).json({
      success: true,
      data: demands,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};
