import mongoose from 'mongoose';
import Percentage from '../models/percentage.model.js';

function validatePercentage(value) {
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) {
    return { ok: false, message: 'percentage must be a number' };
  }
  if (percentage < 0 || percentage > 100) {
    return { ok: false, message: 'percentage must be between 0 and 100' };
  }
  return { ok: true, percentage };
}

/**
 * POST /api/percentage/create
 * Body: { percentage, title?, note?, isActive? }
 */
export const createPercentage = async (req, res) => {
  try {
    const percentCheck = validatePercentage(req.body.percentage);
    if (!percentCheck.ok) {
      return res.status(400).json({ success: false, message: percentCheck.message });
    }

    const doc = await Percentage.create({
      percentage: percentCheck.percentage,
      title: req.body.title?.trim() || '',
      note: req.body.note?.trim() || '',
      isActive: req.body.isActive !== false,
    });

    res.status(201).json({
      success: true,
      message: 'Percentage created',
      data: doc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/percentage/get-all
 */
export const getAllPercentages = async (req, res) => {
  try {
    const filter = {};
    if (req.query.isActive === 'true') filter.isActive = true;
    if (req.query.isActive === 'false') filter.isActive = false;

    const list = await Percentage.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total: list.length,
      data: list,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/percentage/get-by-id/:id
 */
export const getPercentageById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid id',
      });
    }

    const doc = await Percentage.findById(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Percentage not found',
      });
    }

    res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * PUT / PATCH /api/percentage/update/:id
 * Body: { percentage?, title?, note?, isActive? }
 */
export const updatePercentage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid id',
      });
    }

    const update = {};

    if (req.body.percentage !== undefined) {
      const percentCheck = validatePercentage(req.body.percentage);
      if (!percentCheck.ok) {
        return res.status(400).json({ success: false, message: percentCheck.message });
      }
      update.percentage = percentCheck.percentage;
    }

    if (req.body.title !== undefined) update.title = String(req.body.title || '').trim();
    if (req.body.note !== undefined) update.note = String(req.body.note || '').trim();
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);

    if (!Object.keys(update).length) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    const doc = await Percentage.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Percentage not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Percentage updated',
      data: doc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * DELETE /api/percentage/delete/:id
 */
export const deletePercentage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid id',
      });
    }

    const doc = await Percentage.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Percentage not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Percentage deleted',
      data: { id: doc._id },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
