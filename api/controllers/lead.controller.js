import Lead from '../models/lead.model.js';
import LeadStatusNotification from '../models/leadStatusNotification.model.js';
import Maker from '../models/maker.model.js';
import { errorHandler } from '../utils/error.js';
import mongoose from 'mongoose';
import { recalculateLeadRemainingAmount, initializeLeadRemainingAmount, fixLeadRemainingAmount, debugLeadAmounts } from './banktransactions.controller.js';
import EmailActivity from '../models/emailActivity.model.js';
import { getNextLeadIdAndPublish, getNextLeadIdAndPublishPrefer } from '../services/leadId.service.js';
import { syncMetaLeads } from '../services/metaLeadSync.service.js';
import { createCalendarEvent } from '../services/googleCalendar.service.js';

function normalizeMobileForLeadCheck(mobile) {
  if (mobile == null) return null;
  const digits = String(mobile).replace(/\D/g, '');
  if (!digits) return null;
  // Normalize to last 10 digits (handles: 078xxxxxxxx, +91xxxxxxxxxx, 91xxxxxxxxxx, xxxxxxxxxx)
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function normalizePublishForLeadCheck(publish) {
  if (publish == null) return null;
  const p = String(publish).trim().toLowerCase();
  if (!p) return null;
  return p;
}

function normalizeAssignedUserId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value._id ?? value.id ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

/** Only touch assignedAt when assignedUserId is present and actually changed. */
function applyAssignedAtWhenUserChanges(setPayload, leadBefore, body) {
  if (body.assignedUserId === undefined) return;

  const prev = normalizeAssignedUserId(leadBefore?.assignedUserId);
  const next = normalizeAssignedUserId(body.assignedUserId);

  if (next === prev) {
    delete setPayload.assignedAt;
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'assignedAt')) {
    setPayload.assignedAt = next ? new Date() : null;
  }
}

async function findLatestLeadByMobileDigits(mobile, publishOrNull = null) {
  const normalizedMobile = normalizeMobileForLeadCheck(mobile);
  if (!normalizedMobile) return null;
  const mobileRegex = new RegExp(`${normalizedMobile}$`);
  const q = {
    mobile: { $regex: mobileRegex }
  };
  if (publishOrNull) q.publish = publishOrNull;
  return await Lead.findOne(q).sort({ createdAt: -1 }).lean();
}

/**
 * Parse timing string like "9/5/2026 5.30pm", "2/20/2026 6.30pm", or "2/26.2026 5.50pm" (m/d/yyyy or m/d.yyyy, h.mm am/pm) to Date.
 * Assumes timing is in IST (India Standard Time, UTC+5:30) since server often runs in UTC.
 * Returns null if parsing fails.
 */
function parseTimingToDate(timingStr) {
  if (!timingStr || typeof timingStr !== 'string') return null;
  const s = timingStr.trim();
  const match = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\s+(\d{1,2})\.(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  const [, n1, n2, year, hour, min, ampm] = match;
  const y = parseInt(year, 10);
  let h = parseInt(hour, 10);
  const mn = parseInt(min, 10);
  if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
  if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
  const month = parseInt(n1, 10) - 1;
  const day = parseInt(n2, 10);
  // Treat as IST (UTC+5:30): subtract 5.5 hours to get UTC equivalent for server comparison
  const utcMs = Date.UTC(y, month, day, h, mn, 0, 0) - (5.5 * 60 * 60 * 1000);
  const date = new Date(utcMs);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Show notification when current date/time has reached (timing - 10 minutes).
 * Uses full date and time from the timing string, e.g. "1/2/2026 6.20pm" -> show when now >= Jan 2, 2026 6:10 PM.
 * If timing is empty or unparseable, show immediately (return true).
 */
function shouldShowNotificationByTime(timingStr) {
  if (!timingStr || typeof timingStr !== 'string') return true;
  const timingDate = parseTimingToDate(timingStr);
  if (!timingDate) return true;
  const showAfter = new Date(timingDate.getTime() - 10 * 60 * 1000);
  return new Date() >= showAfter;
}

// Create new lead
export const createLead = async (req, res, next) => {
  try {
    let leadData;

    // Manual lead create: prevent duplicates by mobile+publish within last 10 days.
    // Allow same mobile to exist once in PTW and once in Demand.
    // If same mobile+publish exists and is older than 10 days, create but mark isrepeated: true.
    const publishKey = normalizePublishForLeadCheck(req.body?.publish);
    const latestSameMobileSamePublish = await findLatestLeadByMobileDigits(req.body?.mobile, publishKey);
    if (latestSameMobileSamePublish?.createdAt) {
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      const ageMs = Date.now() - new Date(latestSameMobileSamePublish.createdAt).getTime();

      if (ageMs < tenDaysMs) {
        return res.status(200).json({
          message: 'Lead already created',
          lead: latestSameMobileSamePublish,
          created: false
        });
      }

      req.body = { ...req.body, isrepeated: true };
    }
    
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

// CRM create lead: if lead_meta_id is sent, check if it already exists; if yes, skip create; else create
export const crmCreateLead = async (req, res, next) => {
  try {
    const { lead_meta_id } = req.body;
    if (lead_meta_id) {
      const existing = await Lead.findOne({ lead_meta_id });
      if (existing) {
        return res.status(200).json({
          message: 'Lead already exists with this lead_meta_id',
          lead: existing,
          created: false
        });
      }
    }

    // Prevent duplicates by mobile+publish within last 10 days (CRM flow too).
    // Allow same mobile to exist once in PTW and once in Demand.
    // If same mobile+publish exists and createdAt > 10 days ago, still create but mark isrepeated: true.
    const publishKey = normalizePublishForLeadCheck(req.body?.publish);
    const latestSameMobileSamePublish = await findLatestLeadByMobileDigits(req.body?.mobile, publishKey);
    if (latestSameMobileSamePublish?.createdAt) {
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      const ageMs = Date.now() - new Date(latestSameMobileSamePublish.createdAt).getTime();

      if (ageMs < tenDaysMs) {
        return res.status(200).json({
          message: 'Lead already created',
          lead: latestSameMobileSamePublish,
          created: false
        });
      }

      req.body = { ...req.body, isrepeated: true };
    }

    let leadData;
    if (req.isSimpleToken) {
      leadData = {
        ...req.body,
        createdBy: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        isCommonLead: true
      };
    } else {
      if (!req.user || !req.user.id) {
        return next(errorHandler(401, 'User not authenticated'));
      }
      leadData = {
        ...req.body,
        createdBy: req.user.id,
        isCommonLead: req.isCommonToken || false
      };
    }

    // Assign leadId if not provided — shared atomic counter (same as Meta sync).
    // If client sends publish "ptw" | "demand", next ID matches that type (counter may skip one step).
    if (leadData.leadId == null || leadData.leadId === '') {
      const publishPref = (leadData.publish || '').toString().toLowerCase();
      const gen =
        publishPref === 'ptw' || publishPref === 'demand'
          ? await getNextLeadIdAndPublishPrefer(publishPref)
          : await getNextLeadIdAndPublish();
      leadData.leadId = gen.leadId;
      leadData.publish = gen.publish;
    }

    // Meta-sourced CRM creates should default to New Lead when status not sent
    const src = (leadData.source || '').toString().toLowerCase();
    if (src === 'meta' && (leadData.leadStatus == null || leadData.leadStatus === '')) {
      leadData.leadStatus = 'New Lead';
    }

    const newLead = new Lead(leadData);
    let savedLead;
    try {
      savedLead = await newLead.save();
    } catch (saveErr) {
      // Race: another request created the same lead_meta_id first (unique index).
      if (saveErr && saveErr.code === 11000 && lead_meta_id) {
        const existing = await Lead.findOne({ lead_meta_id });
        if (existing) {
          return res.status(200).json({
            message: 'Lead already exists with this lead_meta_id',
            lead: existing,
            created: false
          });
        }
      }
      throw saveErr;
    }

    try {
      if (savedLead.totalAmount !== undefined && savedLead.totalAmount !== null) {
        await initializeLeadRemainingAmount(savedLead._id);
        const finalLead = await Lead.findById(savedLead._id);
        return res.status(201).json({ ...finalLead.toObject(), created: true });
      }
    } catch (error) {
      console.error("Error initializing remaining amount:", error);
    }
    res.status(201).json({ ...savedLead.toObject(), created: true });
  } catch (error) {
    console.error("❌ CRM lead creation error:", error);
    next(error);
  }
};

// Get all leads (modified to handle common token and simple token)
// For executive/team leader: also includes leads where isAssignedLead true and assignedUserId = their id
export const getLeads = async (req, res, next) => {
  try {
    let leads;
    
    if (req.isCommonToken || req.isSimpleToken) {
      // If using common token or simple token, get all leads created with these tokens
      leads = await Lead.find({ isCommonLead: true });
    } else {
      // If using individual token: user's own leads OR leads assigned to them
      leads = await Lead.find({
        $or: [
          { createdBy: req.user.id, isCommonLead: { $ne: true } },
          { isAssignedLead: true, assignedUserId: req.user.id }
        ]
      });
    }
    
    res.status(200).json(leads);
  } catch (error) {
    next(error);
  }
};

// Get single lead (modified to handle common token and simple token)
// For executive/team leader: also allows access if lead is assigned to them
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
      // If using individual token: user's lead OR lead assigned to them
      lead = await Lead.findOne({
        _id: req.params.id,
        $or: [
          { createdBy: req.user.id, isCommonLead: { $ne: true } },
          { isAssignedLead: true, assignedUserId: req.user.id }
        ]
      });
    }
    
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.status(200).json(lead);
  } catch (error) {
    next(error);
  }
};

// Update lead (owner or assignee can update)
export const updateLead = async (req, res, next) => {
  try {
    const leadBefore = await Lead.findOne({
      _id: req.params.id,
      $or: [
        { createdBy: req.user.id },
        { isAssignedLead: true, assignedUserId: req.user.id }
      ]
    });
    if (!leadBefore) return res.status(404).json({ message: 'Lead not found' });

    const setPayload = { ...req.body };
    applyAssignedAtWhenUserChanges(setPayload, leadBefore, req.body);

    const updatedLead = await Lead.findOneAndUpdate(
       {
        _id: req.params.id,
        $or: [
          { createdBy: req.user.id },
          { isAssignedLead: true, assignedUserId: req.user.id }
        ]
      },
      { $set: setPayload },
      { new: true }
    );
    if (!updatedLead) return res.status(404).json({ message: 'Lead not found' });

    // If lead newly assigned/re-assigned, create an immediate Google Calendar "New lead assigned" event
    try {
      const prevAssigned = leadBefore.assignedUserId ? leadBefore.assignedUserId.toString() : null;
      const nextAssigned = updatedLead.assignedUserId ? updatedLead.assignedUserId.toString() : null;
      const assignedChanged =
        req.body.assignedUserId !== undefined && nextAssigned && nextAssigned !== prevAssigned;

      if (assignedChanged) {
        const makerForCalendar = await Maker.findById(updatedLead.assignedUserId);
        if (makerForCalendar?.googleRefreshToken) {
          const googleEventId = await createCalendarEvent(makerForCalendar, {
            lead: updatedLead,
            leadstatus: updatedLead.leadStatus,
            note: 'A new lead has been assigned to you.',
            // Schedule 12 minutes ahead so popup (10-min-before) fires ~2 minutes after creation.
            startDate: new Date(Date.now() + 12 * 60 * 1000),
            timing: 'assignment',
            durationMinutes: 1,
            summaryPrefix: 'New lead assigned',
            transparency: 'transparent'
          });
          if (googleEventId) {
            await Lead.updateOne(
              { _id: updatedLead._id },
              { $set: { assignedGoogleEventId: googleEventId } }
            );
          }
        }
      }
    } catch (calendarError) {
      console.error(
        'Google Calendar assignment event creation failed:',
        calendarError?.message || calendarError
      );
    }

    if (req.body.converted === true && !leadBefore.converted && updatedLead.assignedUserId) {
      await Maker.findByIdAndUpdate(updatedLead.assignedUserId, { $inc: { totalConvertedLeads: 1 } });
    }
    
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
      // If using individual token: user's leads OR leads assigned to them
      deletedLead = await Lead.findOneAndDelete({
        _id: req.params.id,
        $or: [
          { createdBy: req.user.id, isCommonLead: { $ne: true } },
          { isAssignedLead: true, assignedUserId: req.user.id }
        ]
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
    const leadBefore = await Lead.findById(req.params.id);
    if (!leadBefore) return res.status(404).json({ message: 'Lead not found' });

    const setPayload = { ...req.body };
    applyAssignedAtWhenUserChanges(setPayload, leadBefore, req.body);

    const updatedLead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: setPayload },
      { new: true }
    );
    
    if (!updatedLead) return res.status(404).json({ message: 'Lead not found' });

    // If lead newly assigned/re-assigned (public), create an immediate Google Calendar "New lead assigned" event
    try {
      const prevAssigned = leadBefore.assignedUserId ? leadBefore.assignedUserId.toString() : null;
      const nextAssigned = updatedLead.assignedUserId ? updatedLead.assignedUserId.toString() : null;
      const assignedChanged =
        req.body.assignedUserId !== undefined && nextAssigned && nextAssigned !== prevAssigned;

      if (assignedChanged) {
        const makerForCalendar = await Maker.findById(updatedLead.assignedUserId);
        if (makerForCalendar?.googleRefreshToken) {
          const googleEventId = await createCalendarEvent(makerForCalendar, {
            lead: updatedLead,
            leadstatus: updatedLead.leadStatus,
            note: 'A new lead has been assigned to you.',
            // Schedule 12 minutes ahead so popup (10-min-before) fires ~2 minutes after creation.
            startDate: new Date(Date.now() + 12 * 60 * 1000),
            timing: 'assignment',
            durationMinutes: 1,
            summaryPrefix: 'New lead assigned',
            transparency: 'transparent'
          });
          if (googleEventId) {
            await Lead.updateOne(
              { _id: updatedLead._id },
              { $set: { assignedGoogleEventId: googleEventId } }
            );
          }
        }
      }
    } catch (calendarError) {
      console.error(
        'Google Calendar assignment event creation failed (public):',
        calendarError?.message || calendarError
      );
    }

    if (req.body.converted === true && !leadBefore.converted && updatedLead.assignedUserId) {
      await Maker.findByIdAndUpdate(updatedLead.assignedUserId, { $inc: { totalConvertedLeads: 1 } });
    }
    
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

// Delete all leads without requiring ids or token (use with caution)
export const deleteAllLeadsPublic = async (req, res, next) => {
  try {
    const result = await Lead.deleteMany({});
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

/**
 * GET assigned leads for a user: isAssignedLead true and assignedUserId matches path param.
 */

export const getLeadsByAssignedUserId = async (req, res, next) => {
  try {
    const { assignedUserId } = req.params;
    if (!assignedUserId) {
      return res.status(400).json({ message: 'assignedUserId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(assignedUserId)) {
      return res.status(400).json({ message: 'Invalid assignedUserId' });
    }
    const oid = new mongoose.Types.ObjectId(assignedUserId);
    const leads = await Lead.find({
      assignedUserId: oid,
      isAssignedLead: true
    }).sort({ createdAt: -1 });
    res.status(200).json({
      message: 'Leads retrieved successfully',
      leads,
      count: leads.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET leads by assignedUserId (basic projection)
 * Returns only: name, email, mobile, isseen
 */
export const getLeadsByAssignedUserIdBasic = async (req, res, next) => {
  try {
    const { assignedUserId } = req.params;
    if (!assignedUserId) {
      return res.status(400).json({ message: 'assignedUserId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(assignedUserId)) {
      return res.status(400).json({ message: 'Invalid assignedUserId' });
    }
    const oid = new mongoose.Types.ObjectId(assignedUserId);
    const leads = await Lead.find({
      assignedUserId: oid,
      isAssignedLead: true,
      isseen: false
    })
      .select('name email mobile isseen')
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json(leads);
  } catch (error) {
    next(error);
  }
};

/**
 * GET lead status summary by assignedUserId (fast): last leadstatusnote, leadStatus, assignedUserId (populated)
 * GET /get-lead-status-note/:assignedUserId
 */
export const getLeadStatusNoteFast = async (req, res, next) => {
  try {
    const { assignedUserId } = req.params;
    if (!assignedUserId) {
      return res.status(400).json({ message: 'assignedUserId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(assignedUserId)) {
      return res.status(400).json({ message: 'Invalid assignedUserId' });
    }
    const oid = new mongoose.Types.ObjectId(assignedUserId);
    const leads = await Lead.find({
      assignedUserId: oid,
      isAssignedLead: true
    })
      .select('leadStatus assignedUserId leadstatusnote')
      .populate({
        path: 'assignedUserId',
        model: Maker,
        select: 'firstName lastName email contactNo userType designation teamLeaderName teamLeaderId managerId managerName active'
      })
      .sort({ createdAt: -1 })
      .lean();

    const result = leads.map((lead) => {
      const notes = lead.leadstatusnote;
      const lastNote =
        Array.isArray(notes) && notes.length ? notes[notes.length - 1] : null;
      return {
        _id: lead._id,
        leadStatus: lead.leadStatus ?? null,
        leadstatusnote: lastNote,
        assignedUserId: lead.assignedUserId ?? null
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET leads basic trip/contact info by assignedUserId (fast):
 * name, email, mobile, destination, days, nights, leadStatus, all leadstatusnote
 * GET /get-lead-basic-info/:assignedUserId
 */
export const getLeadBasicInfoFast = async (req, res, next) => {
  try {
    const { assignedUserId } = req.params;
    if (!assignedUserId) {
      return res.status(400).json({ message: 'assignedUserId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(assignedUserId)) {
      return res.status(400).json({ message: 'Invalid assignedUserId' });
    }
    const oid = new mongoose.Types.ObjectId(assignedUserId);
    const leads = await Lead.find({
      assignedUserId: oid
    })
      .select('name email mobile destination guestlocation days nights leadStatus leadstatusnote')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(leads);
  } catch (error) {
    next(error);
  }
};
/**
 * Get all emails for a specific lead (email timeline)
 * GET /api/leads/:leadId/emails
 */
export const getLeadEmails = async (req, res, next) => {
  try {
    const { leadId } = req.params;

    // Verify lead exists and user has access
    let lead;
    if (req.isCommonToken || req.isSimpleToken) {
      lead = await Lead.findOne({
        _id: leadId,
        isCommonLead: true
      });
    } else {
      lead = await Lead.findOne({
        _id: leadId,
        createdBy: req.user.id,
        isCommonLead: { $ne: true }
      });
    }

    if (!lead) {
      return next(errorHandler(404, 'Lead not found'));
    }

    // Get all emails for this lead, sorted by date (newest first)
    const emails = await EmailActivity.find({
      leadId: leadId
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'firstName lastName email')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        leadId: leadId,
        emails: emails,
        count: emails.length
      }
    });
  } catch (error) {
    next(error);
  }
};
// Simple GET endpoint that returns "hello harshit"
export const getHelloHarshit = async (req, res, next) => {
  try {
    res.status(200).json({ message: 'hello harshit' });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger Meta (FB/Instagram) lead sync.
 * GET /api/leads/sync-meta-leads
 */
export const syncMetaLeadsController = async (req, res, next) => {
  try {
    const result = await syncMetaLeads();
    res.status(200).json(result);
  } catch (error) {
    console.error('Sync meta leads error:', error);
    next(error);
  }
};

// ========== Assigned Leads API (only isAssignedLead: true) ==========

// GET assigned leads – only leads where isAssignedLead true, for current user (assignedUserId = req.user.id)
export const getAssignedLeads = async (req, res, next) => {
  try {
    const leads = await Lead.find({ isAssignedLead: true });
    res.status(200).json(leads);
  } catch (error) {
    next(error);
  }
};

// GET assigned leads where isAssignedLead true and publish "ptw"
export const getAssignedLeadsPtw = async (req, res, next) => {
  try {
    const leads = await Lead.find({ isAssignedLead: true, publish: 'ptw' });
    res.status(200).json(leads);
  } catch (error) {
    next(error);
  }
};

// GET assigned leads where isAssignedLead true and publish "demand"
export const getAssignedLeadsDemand = async (req, res, next) => {
  try {
    const leads = await Lead.find({ isAssignedLead: true, publish: 'demand' });
    res.status(200).json(leads);
  } catch (error) {
    next(error);
  }
};
const getAssignedLeadsPaginated = async (req, res, next, filter) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;

    const sort = {};
    sort[sortBy] = sortOrder;

    const totalLeads = await Lead.countDocuments(filter);
    const totalPages = Math.ceil(totalLeads / limit);

    const leads = await Lead.find(filter)
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
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET assigned PTW leads with pagination (same filter as getAssignedLeadsPtw)
export const getAssignedLeadsPtwPaginated = async (req, res, next) => {
  return getAssignedLeadsPaginated(req, res, next, { isAssignedLead: true, publish: 'ptw' });
};

// GET assigned Demand leads with pagination (same filter as getAssignedLeadsDemand)
export const getAssignedLeadsDemandPaginated = async (req, res, next) => {
  return getAssignedLeadsPaginated(req, res, next, { isAssignedLead: true, publish: 'demand' });
};
// POST create assigned lead – sets isAssignedLead true and assignedUserId from body
export const createAssignedLead = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(errorHandler(401, 'User not authenticated'));
    }

    // Prevent duplicates by mobile+publish within last 10 days (assigned-leads manual create too).
    const publishKey = normalizePublishForLeadCheck(req.body?.publish);
    const latestSameMobileSamePublish = await findLatestLeadByMobileDigits(req.body?.mobile, publishKey);
    if (latestSameMobileSamePublish?.createdAt) {
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      const ageMs = Date.now() - new Date(latestSameMobileSamePublish.createdAt).getTime();

      if (ageMs < tenDaysMs) {
        return res.status(200).json({
          message: 'Lead already created',
          lead: latestSameMobileSamePublish,
          created: false
        });
      }

      req.body = { ...req.body, isrepeated: true };
    }

    const leadData = {
      ...req.body,
      createdBy: req.user.id,
      isAssignedLead: true,
      assignedUserId: req.body.assignedUserId || req.user.id,
      assignedAt: new Date()
    };
    const newLead = new Lead(leadData);
    const savedLead = await newLead.save();

    // Create an immediate Google Calendar "New lead assigned" event for the assigned executive (if connected)
    try {
      const makerForCalendar = await Maker.findById(savedLead.assignedUserId);
      if (makerForCalendar?.googleRefreshToken) {
        const googleEventId = await createCalendarEvent(makerForCalendar, {
          lead: savedLead,
          leadstatus: savedLead.leadStatus,
          note: 'A new lead has been assigned to you.',
          // Schedule 12 minutes ahead so popup (10-min-before) fires ~2 minutes after creation.
          startDate: new Date(Date.now() + 12 * 60 * 1000),
          timing: 'assignment',
          durationMinutes: 1,
          summaryPrefix: 'New lead assigned',
          transparency: 'transparent'
        });
        if (googleEventId) {
          await Lead.updateOne(
            { _id: savedLead._id },
            { $set: { assignedGoogleEventId: googleEventId } }
          );
        }
      }
    } catch (calendarError) {
      console.error(
        'Google Calendar assignment event creation failed (createAssignedLead):',
        calendarError?.message || calendarError
      );
    }

    try {
      if (savedLead.totalAmount !== undefined && savedLead.totalAmount !== null) {
        await initializeLeadRemainingAmount(savedLead._id);
        const finalLead = await Lead.findById(savedLead._id);
        return res.status(201).json(finalLead);
      }
    } catch (error) {
      console.error('Error initializing remaining amount:', error);
    }
    res.status(201).json(savedLead);
  } catch (error) {
    console.error('Assigned lead creation error:', error);
    next(error);
  }
};

// PUT update assigned lead – only if lead is assigned to current user
export const updateAssignedLead = async (req, res, next) => {
  try {
    const leadBefore = await Lead.findOne({ _id: req.params.id, isAssignedLead: true });
    if (!leadBefore) return res.status(404).json({ message: 'Lead not found' });

    const setPayload = { ...req.body };
    applyAssignedAtWhenUserChanges(setPayload, leadBefore, req.body);

    const updatedLead = await Lead.findOneAndUpdate(
      {
        _id: req.params.id,
        isAssignedLead: true
      },
      { $set: setPayload },
      { new: true }
    );
    if (!updatedLead) return res.status(404).json({ message: 'Lead not found' });

    // If lead newly assigned/re-assigned (assigned-leads flow), create immediate Calendar event
    try {
      const prevAssigned = leadBefore.assignedUserId ? leadBefore.assignedUserId.toString() : null;
      const nextAssigned = updatedLead.assignedUserId ? updatedLead.assignedUserId.toString() : null;
      const assignedChanged =
        req.body.assignedUserId !== undefined && nextAssigned && nextAssigned !== prevAssigned;

      if (assignedChanged) {
        const makerForCalendar = await Maker.findById(updatedLead.assignedUserId);
        if (makerForCalendar?.googleRefreshToken) {
          const googleEventId = await createCalendarEvent(makerForCalendar, {
            lead: updatedLead,
            leadstatus: updatedLead.leadStatus,
            note: 'A new lead has been assigned to you.',
            // Schedule 12 minutes ahead so popup (10-min-before) fires ~2 minutes after creation.
            startDate: new Date(Date.now() + 12 * 60 * 1000),
            timing: 'assignment',
            durationMinutes: 1,
            summaryPrefix: 'New lead assigned',
            transparency: 'transparent'
          });
          if (googleEventId) {
            await Lead.updateOne(
              { _id: updatedLead._id },
              { $set: { assignedGoogleEventId: googleEventId } }
            );
          }
        }
      }
    } catch (calendarError) {
      console.error(
        'Google Calendar assignment event creation failed (updateAssignedLead):',
        calendarError?.message || calendarError
      );
    }

    if (req.body.converted === true && !leadBefore.converted && updatedLead.assignedUserId) {
      await Maker.findByIdAndUpdate(updatedLead.assignedUserId, { $inc: { totalConvertedLeads: 1 } });
    }
    if (req.body.totalAmount !== undefined) {
      try {
        await recalculateLeadRemainingAmount(updatedLead._id);
        const finalLead = await Lead.findById(updatedLead._id);
        return res.status(200).json(finalLead);
      } catch (error) {
        console.error('Error recalculating remaining amount:', error);
        return res.status(200).json(updatedLead);
      }
    }
    res.status(200).json(updatedLead);
  } catch (error) {
    next(error);
  }
};

// PUT bulk update assignedUserId for multiple leads
// Body: { leadIds: string[], assignedUserId: string }
export const bulkUpdateAssignedUserId = async (req, res, next) => {
  try {
    const { leadIds, assignedUserId } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ message: 'leadIds array is required' });
    }
    if (!assignedUserId) {
      return res.status(400).json({ message: 'assignedUserId is required' });
    }

    // Fetch current assignedUserId to detect changes and avoid duplicate Calendar spam
    const beforeLeads = await Lead.find({ _id: { $in: leadIds } })
      .select('_id assignedUserId leadStatus name mobile email leadId')
      .lean();

    const assignedUserIdStr = normalizeAssignedUserId(assignedUserId);
    const bulkAssignedAt = Object.prototype.hasOwnProperty.call(req.body, 'assignedAt')
      ? req.body.assignedAt
      : new Date();
    const foundIds = new Set((beforeLeads || []).map((l) => String(l._id)));
    const bulkOps = (beforeLeads || []).map((l) => {
      const prev = normalizeAssignedUserId(l.assignedUserId);
      const userChanged = prev !== assignedUserIdStr;
      const $set = { assignedUserId, isAssignedLead: true };
      if (userChanged) {
        $set.assignedAt = bulkAssignedAt;
      }
      return { updateOne: { filter: { _id: l._id }, update: { $set } } };
    });
    for (const id of leadIds) {
      if (!foundIds.has(String(id))) {
        bulkOps.push({
          updateOne: {
            filter: { _id: id },
            update: { $set: { assignedUserId, isAssignedLead: true, assignedAt: bulkAssignedAt } }
          }
        });
      }
    }
    const result = bulkOps.length ? await Lead.bulkWrite(bulkOps) : { modifiedCount: 0, matchedCount: 0 };

    // Create immediate Calendar events for leads that actually changed assignee
    try {
      const makerForCalendar = await Maker.findById(assignedUserId);
      if (makerForCalendar?.googleRefreshToken) {
        const changed = (beforeLeads || []).filter((l) => {
          const prev = normalizeAssignedUserId(l.assignedUserId);
          return prev !== assignedUserIdStr;
        });

        // Fire-and-wait sequentially to avoid rate bursts
        for (const l of changed) {
          const googleEventId = await createCalendarEvent(makerForCalendar, {
            lead: l,
            leadstatus: l.leadStatus,
            note: 'A new lead has been assigned to you.',
            // Schedule 12 minutes ahead so popup (10-min-before) fires ~2 minutes after creation.
            startDate: new Date(Date.now() + 12 * 60 * 1000),
            timing: 'assignment',
            durationMinutes: 1,
            summaryPrefix: 'New lead assigned',
            transparency: 'transparent'
          });
          if (googleEventId) {
            await Lead.updateOne(
              { _id: l._id },
              { $set: { assignedGoogleEventId: googleEventId } }
            );
          }
        }
      }
    } catch (calendarError) {
      console.error(
        'Google Calendar assignment event creation failed (bulkUpdateAssignedUserId):',
        calendarError?.message || calendarError
      );
    }

    res.status(200).json({
      message: `Updated assignedUserId for ${result.modifiedCount} lead(s)`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });
  } catch (error) {
    next(error);
  }
};

// PUT bulk update isAssignedLead without token (public API)
// Body: { ids: string[], isAssignedLead: boolean }
export const bulkUpdateIsAssignedLeadPublic = async (req, res, next) => {
  try {
    const { ids, isAssignedLead } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array is required' });
    }
    if (typeof isAssignedLead !== 'boolean') {
      return res.status(400).json({ message: 'isAssignedLead must be boolean (true/false)' });
    }

    const update =
      isAssignedLead === true
        ? { $set: { isAssignedLead: true } }
        : { $set: { isAssignedLead: false, assignedUserId: null, assignedAt: null } };

    const result = await Lead.updateMany({ _id: { $in: ids } }, update);

    res.status(200).json({
      message: `Updated isAssignedLead for ${result.modifiedCount} lead(s)`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });
  } catch (error) {
    next(error);
  }
};
// DELETE assigned lead – only if lead is assigned to current user
export const deleteAssignedLead = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(errorHandler(401, 'User not authenticated'));
    }
    const deletedLead = await Lead.findOneAndDelete({
      _id: req.params.id,
      isAssignedLead: true,
      assignedUserId: req.user.id
    });
    if (!deletedLead) return res.status(404).json({ message: 'Lead not found' });
    res.status(200).json({ message: 'Lead deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ========== Lead status note & notifications ==========

/**
 * Update lead status note: append to leadstatusnote, set leadStatus to latest, create notification (timing stored as person sent).
 * Notification appears in get API only when current time >= (timing - 10 min).
 * Body: leadstatus, note? (optional), timing? (optional), userid, teamleaderid, managerid
 */
export const updateLeadStatusNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { leadstatus, note, timing, userid, teamleaderid, managerid } = req.body;

    if (!leadstatus) {
      return res.status(400).json({ message: 'leadstatus is required' });
    }
    if (!userid && !teamleaderid && !managerid) {
      return res.status(400).json({ message: 'At least one of userid, teamleaderid, managerid is required' });
    }

    const noteEntry = {
      leadstatus,
      ...(note !== undefined && note !== null && { note }),
      ...(timing !== undefined && timing !== null && { timing }),
      userid: userid || undefined,
      teamleaderid: teamleaderid || undefined,
      managerid: managerid || undefined,
      createdAt: new Date(),
      // googleEventId will be filled after successful Calendar call
    };

    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      {
        $push: { leadstatusnote: noteEntry },
        $set: { leadStatus: leadstatus }
      },
      { new: true }
    );

    const autoSeenLeadStatuses = ['Lost', 'Booked', 'Tour Cancelled', 'Tour Postponed'];
    await LeadStatusNotification.create({
      leadId: id,
      leadstatus,
      note: note || '',
      timing: timing || '',
      userid: userid || null,
      teamleaderid: teamleaderid || null,
      managerid: managerid || null,
      seen: autoSeenLeadStatuses.includes(leadstatus)
    });

    // Also create or update a Google Calendar event for the maker/executive, if connected
    try {
      if (timing) {
        // Last pushed note (the one we just added)
        const lastNote =
          updatedLead.leadstatusnote && updatedLead.leadstatusnote.length
            ? updatedLead.leadstatusnote[updatedLead.leadstatusnote.length - 1]
            : null;

        const makerIdForCalendar = lead.assignedUserId || lead.createdBy;
        if (makerIdForCalendar && lastNote) {
          const makerForCalendar = await Maker.findById(makerIdForCalendar);
          if (makerForCalendar && makerForCalendar.googleRefreshToken) {
            const googleEventId = await createCalendarEvent(makerForCalendar, {
              lead,
              leadstatus,
              note,
              timing,
              googleEventId: lastNote.googleEventId,
            });

            if (googleEventId) {
              // Persist event id on the same leadstatusnote subdocument
              await Lead.updateOne(
                { _id: id, 'leadstatusnote._id': lastNote._id },
                { $set: { 'leadstatusnote.$.googleEventId': googleEventId } }
              );
            }
          }
        }
      }
    } catch (calendarError) {
      console.error('Google Calendar event creation failed:', calendarError?.message || calendarError);
      // Do not block normal notification flow on calendar errors
    }

    res.status(200).json(updatedLead);
  } catch (error) {
    next(error);
  }
};

/**
 * Get ALL lead status notifications for a user (userid) from ALL leads.
 * Single source: LeadStatusNotification. Filter by userid only (e.g. 1232).
 * Same userid can appear in many leads' notes — we return all of them.
 * seen: false only. Timing filter applied (show when current time >= timing - 10 min).
 */
export const getLeadStatusNotificationsByUserId = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const excludedLeadStatusesForUserPanel = ['Lost', 'Booked', 'Tour Cancelled', 'Tour Postponed'];
    const all = await LeadStatusNotification.find({
      userid: userId,
      seen: false,
      leadstatus: { $nin: excludedLeadStatusesForUserPanel }
    })
      .sort({ createdAt: -1 })
      .lean();
    const notifications = all.filter((n) => shouldShowNotificationByTime(n.timing || ''));
    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
};

/**
 * Get lead status notifications by teamleaderid (seen: false only).
 * Only returns notifications when current time has reached (timing - 10 minutes).
 */
export const getLeadStatusNotificationsByTeamLeaderId = async (req, res, next) => {
  try {
    const teamLeaderId = req.params.teamLeaderId || req.query.teamLeaderId;
    if (!teamLeaderId) {
      return res.status(400).json({ message: 'teamLeaderId is required' });
    }
    const all = await LeadStatusNotification.find({
      teamleaderid: teamLeaderId
    })
      .sort({ createdAt: -1 })
      .lean();
    const notifications = all.filter((n) => shouldShowNotificationByTime(n.timing));
    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a specific leadstatusnote subdocument as seen (seen: true).
 * PUT /mark-lead-status-note-seen/:leadId/:noteId
 * leadId = Lead._id, noteId = leadstatusnote[]._id (e.g. 699953418d7e2f48a7fecf51)
 */
export const markLeadStatusNoteSeen = async (req, res, next) => {
  try {
    const { leadId, noteId } = req.params;
    const updated = await Lead.findOneAndUpdate(
      { _id: leadId, 'leadstatusnote._id': noteId },
      { $set: { 'leadstatusnote.$.seen': true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Lead or lead status note not found' });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a specific lead status notification as seen (seen: true).
 * Supports both: (1) noteId from leadstatusnote - finds Lead and updates note
 * (2) LeadStatusNotification _id - updates that document.
 * PUT /mark-lead-status-notification-seen/:id
 * PATCH /lead-status-notification/:id/seen (frontend-friendly)
 */
export const markLeadStatusNotificationSeen = async (req, res, next) => {
  try {
    const { id } = req.params;
    // First try: update Lead.leadstatusnote by note _id
    const leadUpdated = await Lead.findOneAndUpdate(
      { 'leadstatusnote._id': id },
      { $set: { 'leadstatusnote.$.seen': true } },
      { new: true }
    );
    if (leadUpdated) {
      return res.status(200).json({ success: true, message: 'Marked as seen' });
    }
    // Fallback: update LeadStatusNotification
    const updated = await LeadStatusNotification.findByIdAndUpdate(
      id,
      { $set: { seen: true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Lead status notification not found' });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

/**
 * Get lead status notifications by managerid (seen: false only).
 * Only returns notifications when current time has reached (timing - 10 minutes).
 */
export const getLeadStatusNotificationsByManagerId = async (req, res, next) => {
  try {
    const managerId = req.params.managerId || req.query.managerId;
    if (!managerId) {
      return res.status(400).json({ message: 'managerId is required' });
    }
    const all = await LeadStatusNotification.find({
      managerid: managerId
    })
      .sort({ createdAt: -1 })
      .lean();
    const notifications = all.filter((n) => shouldShowNotificationByTime(n.timing));
    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
};

export const deleteLeadStatusNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await LeadStatusNotification.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Lead status notification not found' });
    res.status(200).json({ message: 'Lead status note deleted successfully', deleted });
  } catch (error) {
    next(error);
  }
};

/**
 * One-time cleanup: remove createdAt from every leadstatusnote subdocument.
 * Does not delete notes — only unsets the createdAt field.
 */
export const removeLeadStatusNoteCreatedAt = async (req, res, next) => {
  try {
    const result = await Lead.updateMany(
      { 'leadstatusnote.createdAt': { $exists: true } },
      { $unset: { 'leadstatusnote.$[].createdAt': '' } }
    );

    res.status(200).json({
      message: 'Removed createdAt from all leadstatusnote entries',
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};
