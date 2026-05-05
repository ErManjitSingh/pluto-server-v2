import TargetManagement from '../models/targetmanagement.model.js';

const toTargetsArray = (payload) => {
  if (Array.isArray(payload.targets)) return payload.targets;

  if (
    payload.targetData !== undefined ||
    payload.numberOfLeads !== undefined ||
    payload.userId !== undefined ||
    payload.teamLeaderId !== undefined ||
    payload.managerId !== undefined
  ) {
    return [
      {
        targetData: payload.targetData,
        numberOfLeads: payload.numberOfLeads,
        userId: payload.userId,
        teamLeaderId: payload.teamLeaderId ?? null,
        managerId: payload.managerId ?? null,
      },
    ];
  }

  return [];
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

    const existingMonth = await TargetManagement.findOne({ month });
    if (existingMonth) {
      existingMonth.targets.push(...targets);
      await existingMonth.save();
      return res.status(200).json(existingMonth);
    }

    const createdTarget = await TargetManagement.create({ month, targets });
    return res.status(201).json(createdTarget);
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

    const targets = await TargetManagement.find(filters).sort({ createdAt: -1 });
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagement = async (req, res, next) => {
  try {
    const target = await TargetManagement.findById(req.params.id);

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
    const targets = await TargetManagement.find({ 'targets.userId': userId }).sort({ createdAt: -1 });
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByTeamLeaderId = async (req, res, next) => {
  try {
    const { teamLeaderId } = req.params;
    const targets = await TargetManagement.find({ 'targets.teamLeaderId': teamLeaderId }).sort({ createdAt: -1 });
    return res.status(200).json(targets);
  } catch (error) {
    next(error);
  }
};

export const getTargetManagementsByManagerId = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const targets = await TargetManagement.find({ 'targets.managerId': managerId }).sort({ createdAt: -1 });
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
