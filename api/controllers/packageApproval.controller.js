import approval from '../models/packageApproval.model.js';
import { errorHandler } from '../utils/error.js';

export const createAddd = async (req, res, next) => {
  try {
    const add = await approval.create(req.body);
    return res.status(201).json(add);
  } catch (error) {
    next(error);
  }
};

export const getAddds = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [adds, total] = await Promise.all([
      approval.find().skip(skip).limit(limit),
      approval.countDocuments()
    ]);

    return res.status(200).json({
      data: adds,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

export const getAddd = async (req, res, next) => {
  try {
    const add = await approval.findById(req.params.id);
    if (!add) return next(errorHandler(404, 'Add not found!'));
    return res.status(200).json(add);
  } catch (error) {
    next(error);
  }
};

export const updateAddd = async (req, res, next) => {
  try {
    const add = await approval.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!add) return next(errorHandler(404, 'Add not found!'));
    return res.status(200).json(add);
  } catch (error) {
    next(error);
  }
};

export const deleteAddd = async (req, res, next) => {
  try {
    const add = await approval.findByIdAndDelete(req.params.id);
    if (!add) return next(errorHandler(404, 'Add not found!'));
    return res.status(200).json('Add has been deleted!');
  } catch (error) {
    next(error);
  }
};

export const deleteMultipleAddds = async (req, res, next) => {
  try {
    const { ids } = req.body; // Expect an array of ids in the request body
    
    if (!Array.isArray(ids)) {
      return next(errorHandler(400, 'ids should be an array'));
    }

    const result = await Add.deleteMany({ _id: { $in: ids } });
    
    if (result.deletedCount === 0) {
      return next(errorHandler(404, 'No adds found to delete!'));
    }

    return res.status(200).json(`Successfully deleted ${result.deletedCount} adds`);
  } catch (error) {
    next(error);
    
  }
};
export const getAdddsByState = async (req, res, next) => {
  try {
    const { state } = req.params;

    const adds = await approval.find({ 'package.state': state });

    return res.status(200).json({
      data: adds,
      total: adds.length,
      state: state
    });
  } catch (error) {
    next(error);
  }
};
export const getPackagesByTeamLeaderId = async (req, res, next) => {
  try {
    const { teamLeaderId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [packages, total] = await Promise.all([
      approval.find({ 'package.teamLeaderId': teamLeaderId })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      approval.countDocuments({ 'package.teamLeaderId': teamLeaderId })
    ]);

    return res.status(200).json({
      data: packages,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      teamLeaderId: teamLeaderId
    });
  } catch (error) {
    next(error);
  }
};
export const getPackagesOnly = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [packages, total] = await Promise.all([
      approval.find({}, { package: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      approval.countDocuments()
    ]);

    return res.status(200).json({
      data: packages,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

