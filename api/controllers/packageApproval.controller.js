import approval from '../models/packageApproval.model.js';
import { errorHandler } from '../utils/error.js';
import {
  generatePackageSignature,
  findDuplicateInAdd,
  buildDuplicateResponse,
} from '../utils/packageSignature.js';

export const createAddd = async (req, res, next) => {
  try {
    const pkg = req.body.package;
    if (!pkg) {
      return next(errorHandler(400, 'Package data is required'));
    }

    const uniqueSignature = generatePackageSignature(pkg);
    const existing = await findDuplicateInAdd(uniqueSignature);

    if (existing) {
      return res.status(400).json(buildDuplicateResponse(existing));
    }

    const add = await approval.create({
      ...req.body,
      uniqueSignature,
    });
    return res.status(201).json(add);
  } catch (error) {
    next(error);
  }
};

export const migrateApprovalSignatures = async (req, res, next) => {
  try {
    try {
      await approval.collection.dropIndex('uniqueSignature_1');
    } catch (_) {
      // index may not exist yet
    }
    await approval.collection.createIndex({ uniqueSignature: 1 });

    const packages = await approval.find().select('package').lean();

    const bulkOps = [];
    let updated = 0;
    let skipped = 0;

    for (const doc of packages) {
      const signature = generatePackageSignature(doc.package);
      if (!signature) {
        skipped++;
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { uniqueSignature: signature } },
        },
      });
      updated++;
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      const batch = bulkOps.slice(i, i + BATCH_SIZE);
      await approval.bulkWrite(batch, { ordered: false });
    }

    const duplicateGroups = await approval.aggregate([
      { $match: { uniqueSignature: { $ne: '' } } },
      {
        $group: {
          _id: '$uniqueSignature',
          count: { $sum: 1 },
          packages: {
            $push: {
              id: '$_id',
              packageName: '$package.packageName',
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    return res.status(200).json({
      success: true,
      message: 'Unique signatures created for all approval packages',
      stats: {
        total: packages.length,
        updated,
        skipped,
        duplicateGroups: duplicateGroups.length,
      },
      duplicates: duplicateGroups.map((group) => ({
        signature: group._id,
        count: group.count,
        packages: group.packages,
      })),
    });
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
    const { id } = req.params;
    const updateData = { ...req.body };

    // Edit pe sirf signature refresh — duplicate check nahi (create pe hi check hota hai)
    if (req.body.package) {
      const uniqueSignature = generatePackageSignature(req.body.package);
      if (uniqueSignature) {
        updateData.uniqueSignature = uniqueSignature;
      }
    }

    const add = await approval.findByIdAndUpdate(id, updateData, { new: true });
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
    const { ids } = req.body;
    
    if (!Array.isArray(ids)) {
      return next(errorHandler(400, 'ids should be an array'));
    }

    const result = await approval.deleteMany({ _id: { $in: ids } });
    
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
