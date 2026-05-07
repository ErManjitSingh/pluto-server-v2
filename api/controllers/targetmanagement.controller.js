import TargetManagement from '../models/targetmanagement.model.js';

const toTargetsArray = (payload) => {
  if (Array.isArray(payload.targets)) return payload.targets;

  if (
    payload.targetData !== undefined ||
    payload.numberOfLeads !== undefined ||
    payload.companyName !== undefined ||
    payload.userId !== undefined ||
    payload.teamLeaderId !== undefined ||
    payload.managerId !== undefined
  ) {
    return [
      {
        targetData: payload.targetData,
        numberOfLeads: payload.numberOfLeads,
        companyName: payload.companyName ?? null,
        userId: payload.userId,
        teamLeaderId: payload.teamLeaderId ?? null,
        managerId: payload.managerId ?? null,
      },
    ];
  }

  return [];
};

const runListQuery = async (filters) => {
  return TargetManagement.find(filters).sort({ createdAt: -1 }).lean().maxTimeMS(15000);
};

export const createTargetManagement = async (req, res, next) => {
  try {
    const month = req.body.month ? String(req.body.month).toLowerCase() : null;
    const targets = toTargetsArray(req.body);

    if (!month) {
      return res.status(400).json({ message: 'month is required' });
    }
    if (!targets.length) {
      return res.status(400).json({ message: 'targets array (or target fields) is required' });
    }

    // Atomic upsert to avoid read-modify-write overhead and race conditions
    const updatedDoc = await TargetManagement.findOneAndUpdate(
      { month },
      {
        $setOnInsert: { month },
        $push: { targets: { $each: targets } },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    const statusCode = updatedDoc.createdAt && updatedDoc.updatedAt && updatedDoc.createdAt.getTime() === updatedDoc.updatedAt.getTime() ? 201 : 200;
    return res.status(statusCode).json(updatedDoc);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagements = async (req, res, next) => {
  try {
    const filters = {};

    if (req.query.month) filters.month = String(req.query.month).toLowerCase();
    if (req.query.userId) filters['targets.userId'] = req.query.userId;
    if (req.query.teamLeaderId) filters['targets.teamLeaderId'] = req.query.teamLeaderId;
    if (req.query.managerId) filters['targets.managerId'] = req.query.managerId;
    if (req.query.companyName) filters['targets.companyName'] = req.query.companyName;

    const targets = await runListQuery(filters);
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagement = async (req, res, next) => {
  try {
    const target = await TargetManagement.findById(req.params.id).lean().maxTimeMS(15000);

    if (!target) {
      return res.status(404).json({ message: 'Target management not found' });
    }

    return res.status(200).json(target);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdStr = String(userId);

    const docs = await TargetManagement.aggregate([
      { $match: { 'targets.userId': userId } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          month: 1,
          createdAt: 1,
          updatedAt: 1,
          targets: {
            $filter: {
              input: '$targets',
              as: 't',
              cond: { $eq: [{ $toString: '$$t.userId' }, userIdStr] },
            },
          },
        },
      },
    ]).option({ maxTimeMS: 15000 });

    return res.status(200).json(docs);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByTeamLeaderId = async (req, res, next) => {
  try {
    const { teamLeaderId } = req.params;
    const targets = await runListQuery({ 'targets.teamLeaderId': teamLeaderId });
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByManagerId = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const targets = await runListQuery({ 'targets.managerId': managerId });
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByCompanyName = async (req, res, next) => {
  try {
    const { companyName } = req.params;
    const targets = await runListQuery({ 'targets.companyName': companyName });
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const updateTargetManagement = async (req, res, next) => {
  try {
    const payload = { ...req.body };

    if (payload.month) {
      payload.month = String(payload.month).toLowerCase();
    }

    if (!payload.targets) {
      const derivedTargets = toTargetsArray(payload);
      if (derivedTargets.length) {
        payload.targets = derivedTargets;
      }
    }

    delete payload.targetData;
    delete payload.numberOfLeads;
    delete payload.companyName;
    delete payload.userId;
    delete payload.teamLeaderId;
    delete payload.managerId;

    const updatedTarget = await TargetManagement.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!updatedTarget) {
      return res.status(404).json({ message: 'Target management not found' });
    }

    return res.status(200).json(updatedTarget);
  } catch (error) {
    next(error);
  }
};

// Update a specific target item inside targets[] by target _id
export const updateSpecificTarget = async (req, res, next) => {
  try {
    const { targetId } = req.params;
    const { targetData, numberOfLeads, companyName, userId, teamLeaderId, managerId } = req.body;
    const setPayload = {};
    if (targetData !== undefined) setPayload['targets.$.targetData'] = targetData;
    if (numberOfLeads !== undefined) setPayload['targets.$.numberOfLeads'] = numberOfLeads;
    if (companyName !== undefined) setPayload['targets.$.companyName'] = companyName;
    if (userId !== undefined) setPayload['targets.$.userId'] = userId;
    if (teamLeaderId !== undefined) setPayload['targets.$.teamLeaderId'] = teamLeaderId;
    if (managerId !== undefined) setPayload['targets.$.managerId'] = managerId;

    if (Object.keys(setPayload).length === 0) {
      return res.status(400).json({ message: 'At least one field is required for update' });
    }

    const updatedDoc = await TargetManagement.findOneAndUpdate(
      { 'targets._id': targetId },
      { $set: setPayload },
      { new: true, runValidators: true }
    );

    if (!updatedDoc) {
      return res.status(404).json({ message: 'Target item not found' });
    }

    return res.status(200).json(updatedDoc);
  } catch (error) {
    next(error);
  }
};

// Delete a specific target item inside targets[] by target _id
export const deleteSpecificTarget = async (req, res, next) => {
  try {
    const { targetId } = req.params;

    const updatedDoc = await TargetManagement.findOneAndUpdate(
      { 'targets._id': targetId },
      { $pull: { targets: { _id: targetId } } },
      { new: true }
    );

    if (!updatedDoc) {
      return res.status(404).json({ message: 'Target item not found' });
    }

    return res.status(200).json({
      message: 'Target item deleted successfully',
      data: updatedDoc,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTargetManagement = async (req, res, next) => {
  try {
    const deletedTarget = await TargetManagement.findByIdAndDelete(req.params.id);

    if (!deletedTarget) {
      return res.status(404).json({ message: 'Target management not found' });
    }

    return res.status(200).json({ message: 'Target management deleted successfully' });
  } catch (error) {
    next(error);
  }
};
