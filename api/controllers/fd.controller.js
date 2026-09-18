import mongoose from 'mongoose';
import Fd from '../models/fd.model.js';

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Store/match duration as 4D3N (spaces/case ignored). */
const normalizeDuration = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

const normalizeLocation = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const normalizePdfUrl = (value) => String(value || '').trim();

const isHttpUrl = (value) => /^https?:\/\//i.test(value);

export const createFd = async (req, res) => {
  try {
    const duration = normalizeDuration(req.body.duration);
    const location = normalizeLocation(req.body.location);
    const pdfUrl = normalizePdfUrl(req.body.pdfUrl);
    const originalFilename = String(req.body.originalFilename || '').trim();

    if (!duration || !location) {
      return res.status(400).json({
        success: false,
        message: 'duration and location are required',
      });
    }

    if (!pdfUrl || !isHttpUrl(pdfUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Firebase pdfUrl is required',
      });
    }

    const fd = await Fd.create({
      duration,
      location,
      pdfUrl,
      originalFilename,
    });

    return res.status(201).json({
      success: true,
      message: 'FD saved successfully',
      data: fd,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getFds = async (req, res) => {
  try {
    const filters = {};
    if (req.query.location) {
      filters.location = new RegExp(String(req.query.location).trim(), 'i');
    }
    if (req.query.duration) {
      filters.duration = normalizeDuration(req.query.duration);
    }

    const fds = await Fd.find(filters).sort({ createdAt: -1 }).lean();
    return res.status(200).json({
      success: true,
      data: fds,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getFdsByDurationAndLocation = async (req, res) => {
  try {
    const duration = normalizeDuration(req.query.duration);
    const location = normalizeLocation(req.query.location);

    if (!duration || !location) {
      return res.status(400).json({
        success: false,
        message: 'Both query params are required: duration and location',
      });
    }

    const fds = await Fd.find({
      duration,
      location: {
        $regex: new RegExp(`^\\s*${escapeRegex(location)}\\s*$`, 'i'),
      },
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      query: { duration, location },
      data: fds,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getFd = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const fd = await Fd.findById(id).lean();
    if (!fd) {
      return res.status(404).json({ success: false, message: 'FD not found' });
    }

    return res.status(200).json({
      success: true,
      data: fd,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateFd = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const fd = await Fd.findById(id);
    if (!fd) {
      return res.status(404).json({ success: false, message: 'FD not found' });
    }

    if (req.body.duration !== undefined) {
      const duration = normalizeDuration(req.body.duration);
      if (!duration) {
        return res.status(400).json({ success: false, message: 'duration cannot be empty' });
      }
      fd.duration = duration;
    }

    if (req.body.location !== undefined) {
      const location = normalizeLocation(req.body.location);
      if (!location) {
        return res.status(400).json({ success: false, message: 'location cannot be empty' });
      }
      fd.location = location;
    }

    if (req.body.pdfUrl !== undefined) {
      const pdfUrl = normalizePdfUrl(req.body.pdfUrl);
      if (!pdfUrl || !isHttpUrl(pdfUrl)) {
        return res.status(400).json({
          success: false,
          message: 'Valid Firebase pdfUrl is required',
        });
      }
      fd.pdfUrl = pdfUrl;
    }

    if (req.body.originalFilename !== undefined) {
      fd.originalFilename = String(req.body.originalFilename || '').trim();
    }

    const saved = await fd.save();
    return res.status(200).json({
      success: true,
      message: 'FD updated successfully',
      data: saved,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteFd = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const fd = await Fd.findByIdAndDelete(id);
    if (!fd) {
      return res.status(404).json({ success: false, message: 'FD not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'FD deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
