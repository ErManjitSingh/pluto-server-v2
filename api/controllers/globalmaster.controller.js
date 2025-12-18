import GlobalMaster from '../models/globalmaster.model.js';
import { errorHandler } from '../utils/error.js';

// Create new global master entry
export const createGlobalMaster = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    
    if (!name || !description) {
      return next(errorHandler(400, 'Name and description are required'));
    }

    const newGlobalMaster = new GlobalMaster({
      name,
      description
    });

    const savedGlobalMaster = await newGlobalMaster.save();
    res.status(201).json(savedGlobalMaster);
  } catch (error) {
    next(error);
  }
};

// Get all global master entries
export const getAllGlobalMaster = async (req, res, next) => {
  try {
    const globalMasters = await GlobalMaster.find().sort({ createdAt: -1 });
    res.status(200).json(globalMasters);
  } catch (error) {
    next(error);
  }
};

// Get single global master entry by ID
export const getGlobalMasterById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return next(errorHandler(400, 'ID is required'));
    }

    const globalMaster = await GlobalMaster.findById(id);
    
    if (!globalMaster) {
      return next(errorHandler(404, 'Global Master entry not found'));
    }

    res.status(200).json(globalMaster);
  } catch (error) {
    next(error);
  }
};

// Update global master entry
export const updateGlobalMaster = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!id) {
      return next(errorHandler(400, 'ID is required'));
    }

    if (!name || !description) {
      return next(errorHandler(400, 'Name and description are required'));
    }

    const updatedGlobalMaster = await GlobalMaster.findByIdAndUpdate(
      id,
      {
        name,
        description
      },
      { new: true, runValidators: true }
    );

    if (!updatedGlobalMaster) {
      return next(errorHandler(404, 'Global Master entry not found'));
    }

    res.status(200).json(updatedGlobalMaster);
  } catch (error) {
    next(error);
  }
};

// Delete global master entry
export const deleteGlobalMaster = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(errorHandler(400, 'ID is required'));
    }

    const deletedGlobalMaster = await GlobalMaster.findByIdAndDelete(id);

    if (!deletedGlobalMaster) {
      return next(errorHandler(404, 'Global Master entry not found'));
    }

    res.status(200).json({ message: 'Global Master entry deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Bulk create global master entries
export const bulkCreateGlobalMaster = async (req, res, next) => {
  try {
    const { data } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return next(errorHandler(400, 'Data array is required'));
    }

    // Validate each entry
    for (const entry of data) {
      if (!entry.name || !entry.description) {
        return next(errorHandler(400, 'Each entry must have name and description'));
      }
    }

    const globalMasters = await GlobalMaster.insertMany(data);
    res.status(201).json(globalMasters);
  } catch (error) {
    next(error);
  }
};
