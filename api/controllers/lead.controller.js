import Lead from '../models/lead.model.js';
import { errorHandler } from '../utils/error.js';
import mongoose from 'mongoose';
import { recalculateLeadRemainingAmount, initializeLeadRemainingAmount, fixLeadRemainingAmount, debugLeadAmounts } from './banktransactions.controller.js';

// Create new lead
export const createLead = async (req, res, next) => {
  try {
    let leadData;
    
    if (req.isSimpleToken) {
      // For simple token, use a fixed user ID and mark as common lead
      leadData = {
        ...req.body,
        createdBy: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        isCommonLead: true
      };
    } else {
      // For regular JWT tokens, require user authentication
      if (!req.user || !req.user.id) {
        return next(errorHandler(401, 'User not authenticated'));
      }
      
      leadData = {
        ...req.body,
        createdBy: req.user.id,
        isCommonLead: req.isCommonToken || false
      };
    }

    const newLead = new Lead(leadData);
    const savedLead = await newLead.save();
    
    // Initialize remainingAmount for the new lead
    try {
      if (savedLead.totalAmount !== undefined && savedLead.totalAmount !== null) {
        await initializeLeadRemainingAmount(savedLead._id);
        // Fetch the lead with initialized remainingAmount
        const finalLead = await Lead.findById(savedLead._id);
        return res.status(201).json(finalLead);
      }
    } catch (error) {
      console.error("Error initializing remaining amount:", error);
      // Return the lead even if initialization fails
    }
    
    res.status(201).json(savedLead);
  } catch (error) {
    console.error("❌ Lead creation error:", error); // Add this for logs
    next(error);
  }
};

// Get all leads (modified to handle common token and simple token)
export const getLeads = async (req, res, next) => {
  try {
    let leads;
    
    if (req.isCommonToken || req.isSimpleToken) {
      // If using common token or simple token, get all leads created with these tokens
      leads = await Lead.find({ isCommonLead: true });
    } else {
      // If using individual token, get only user's leads
      leads = await Lead.find({ createdBy: req.user.id, isCommonLead: { $ne: true } });
    }
    
    res.status(200).json(leads);
  } catch (error) {
    next(error);
  }
};

// Get single lead (modified to handle common token and simple token)
export const getLead = async (req, res, next) => {
  try {
    let lead;
    
    if (req.isCommonToken || req.isSimpleToken) {
      // If using common token or simple token, find lead that was created with these tokens
      lead = await Lead.findOne({
        _id: req.params.id,
        isCommonLead: true
      });
    } else {
      // If using individual token, find user's lead
      lead = await Lead.findOne({
        _id: req.params.id,
        createdBy: req.user.id,
        isCommonLead: { $ne: true }
      });
    }
    
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.status(200).json(lead);
  } catch (error) {
    next(error);
  }
};

// Update lead
export const updateLead = async (req, res, next) => {
  try {
    const updatedLead = await Lead.findOneAndUpdate(
       {
        _id: req.params.id,
        createdBy: req.user.id
      },
      { $set: req.body },
      { new: true }
    );
    if (!updatedLead) return res.status(404).json({ message: 'Lead not found' });
    
    // If totalAmount was updated, recalculate remainingAmount
    if (req.body.totalAmount !== undefined) {
      try {
        await recalculateLeadRemainingAmount(updatedLead._id);
        // Fetch the updated lead with recalculated remainingAmount
        const finalLead = await Lead.findById(updatedLead._id);
        return res.status(200).json(finalLead);
      } catch (error) {
        console.error("Error recalculating remaining amount:", error);
        // Return the lead even if recalculation fails
        return res.status(200).json(updatedLead);
      }
    }
    
    res.status(200).json(updatedLead);
  } catch (error) {
    next(error);
  }
};

// Delete lead (modified to handle all token types)
export const deleteLead = async (req, res, next) => {
  try {
    let deletedLead;
    
    if (req.isCommonToken || req.isSimpleToken) {
      // If using common token or simple token, delete from common leads
      deletedLead = await Lead.findOneAndDelete({
        _id: req.params.id,
        isCommonLead: true
      });
    } else {
      // If using individual token, delete from user's leads
      deletedLead = await Lead.findOneAndDelete({
        _id: req.params.id,
        createdBy: req.user.id,
        isCommonLead: { $ne: true }
      });
    }
    
    if (!deletedLead) return res.status(404).json({ message: 'Lead not found' });
    res.status(200).json({ message: 'Lead deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete multiple leads (modified to handle all token types)
export const deleteMultipleLeads = async (req, res, next) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of lead IDs' });
    }

    let result;
    
    if (req.isCommonToken || req.isSimpleToken) {
      // If using common token or simple token, delete from common leads
      result = await Lead.deleteMany({ 
        _id: { $in: ids },
        isCommonLead: true
      });
    } else {
      // If using individual token, delete from user's leads
      result = await Lead.deleteMany({ 
        _id: { $in: ids },
        createdBy: req.user.id,
        isCommonLead: { $ne: true }
      });
    }
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'No leads found to delete' });
    }

    res.status(200).json({ 
      message: `Successfully deleted ${result.deletedCount} leads`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};

// Get all leads without token (public API)
export const getLeadsPublic = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2015;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // Calculate skip value for pagination
    const skip = (page - 1) * limit;
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder;
    
    // Get total count for pagination info
    const totalLeads = await Lead.countDocuments({});
    const totalPages = Math.ceil(totalLeads / limit);
    
    // Get leads with pagination and sorting
    const leads = await Lead.find({})
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    res.status(200).json({
      leads,
      pagination: {
        currentPage: page,
        totalPages,
        totalLeads,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single lead without token (public API)
export const getLeadPublic = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.status(200).json(lead);
  } catch (error) {
    next(error);
  }
};

// Update lead without token (public API)
export const updateLeadPublic = async (req, res, next) => {
  try {
    const updatedLead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    
    if (!updatedLead) return res.status(404).json({ message: 'Lead not found' });
    
    // If totalAmount was updated, recalculate remainingAmount
    if (req.body.totalAmount !== undefined) {
      try {
        await recalculateLeadRemainingAmount(updatedLead._id);
        // Fetch the updated lead with recalculated remainingAmount
        const finalLead = await Lead.findById(updatedLead._id);
        return res.status(200).json(finalLead);
      } catch (error) {
        console.error("Error recalculating remaining amount:", error);
        // Return the lead even if recalculation fails
        return res.status(200).json(updatedLead);
      }
    }
    
    res.status(200).json(updatedLead);
  } catch (error) {
    next(error);
  }
};

// Delete lead without token (public API)
export const deleteLeadPublic = async (req, res, next) => {
  try {
    const deletedLead = await Lead.findByIdAndDelete(req.params.id);
    
    if (!deletedLead) return res.status(404).json({ message: 'Lead not found' });
    res.status(200).json({ message: 'Lead deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete multiple leads without token (public API)
export const deleteMultipleLeadsPublic = async (req, res, next) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of lead IDs' });
    }

    const result = await Lead.deleteMany({ _id: { $in: ids } });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'No leads found to delete' });
    }

    res.status(200).json({ 
      message: `Successfully deleted ${result.deletedCount} leads`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};

// Transfer lead from static token to user token
export const transferLeadToUser = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find the lead that was created with static token (isCommonLead: true)
    const lead = await Lead.findOne({
      _id: leadId,
      isCommonLead: true
    });

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found or not eligible for transfer' });
    }

    // Update the lead to associate it with the user
    const updatedLead = await Lead.findByIdAndUpdate(
      leadId,
      {
        createdBy: userId,
        isCommonLead: false
      },
      { new: true }
    );

    res.status(200).json({
      message: 'Lead transferred successfully',
      lead: updatedLead
    });
  } catch (error) {
    next(error);
  }
};

// Transfer multiple leads from static token to user token
export const transferMultipleLeadsToUser = async (req, res, next) => {
  try {
    const { leadIds, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of lead IDs' });
    }

    // Update multiple leads to associate them with the user
    const result = await Lead.updateMany(
      {
        _id: { $in: leadIds },
        isCommonLead: true
      },
      {
        createdBy: userId,
        isCommonLead: false
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'No leads found to transfer' });
    }

    res.status(200).json({
      message: `Successfully transferred ${result.modifiedCount} leads`,
      transferredCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

// Utility function to fix remaining amount for existing leads
export const fixLeadRemainingAmountController = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!req.user || !req.user.id) {
      return next(errorHandler(401, 'User not authenticated'));
    }
    
    const result = await fixLeadRemainingAmount(id);
    if (!result) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    res.status(200).json({
      message: 'Lead remaining amount fixed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// Debug function to check lead amounts and transactions
export const debugLeadAmountsController = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!req.user || !req.user.id) {
      return next(errorHandler(401, 'User not authenticated'));
    }
    
    const debugInfo = await debugLeadAmounts(id);
    if (!debugInfo) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    res.status(200).json({
      message: 'Lead debug information retrieved',
      data: debugInfo
    });
  } catch (error) {
    next(error);
  }
};

// Get leads by executive phone for CRM

export const getLeadsByExecutivePhone = async (req, res, next) => {
  try {
    const { executivePhone } = req.query;
    
    if (!executivePhone) {
      return res.status(400).json({ message: 'Executive phone number is required' });
    }
    
    // Find leads by executivePhone (case-insensitive search)
    const leads = await Lead.find({
      executivePhone: { $regex: executivePhone, $options: 'i' }
    }).sort({ createdAt: -1 });
    
    if (leads.length === 0) {
      return res.status(200).json({
        message: 'No leads found for this executive phone number',
        leads: [],
        count: 0
      });
    }
    
    res.status(200).json({
      message: 'Leads retrieved successfully',
      leads,
      count: leads.length
    });
  } catch (error) {
    next(error);
  }
};
