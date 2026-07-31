import DiscountApproval from '../models/discountapproval.model.js';
import { getIO } from '../socket/socket.js';

const emitDiscountApprovalEvent = (event, payload) => {
    const io = getIO();
    if (io) {
        io.emit(event, payload);
    }
};

export const createDiscountApproval = async (req, res) => {
    try {
        const {
            state,
            companyName,
            customerLeadId,
            packageId,
            userId,
            packageName,
            package: packageData,
            loginUserDetail,
            discountPercentage,
            accept,
            managerName
        } = req.body;

        const resolvedUserId = userId || loginUserDetail?.userId;
        const resolvedAccept = accept || 'pending';

        if (!state || !companyName || !customerLeadId || !packageId || !resolvedUserId || !packageName || !packageData || !loginUserDetail || discountPercentage === undefined || !managerName) {
            return res.status(400).json({
                message: 'state, companyName, customerLeadId, packageId, userId, packageName, package, loginUserDetail, discountPercentage, and managerName are required'
            });
        }

        if (!['pending', 'accepted'].includes(resolvedAccept)) {
            return res.status(400).json({
                message: 'accept must be either pending or accepted'
            });
        }

        const filter = {
            state,
            userId: resolvedUserId,
            packageId,
            customerLeadId
        };

        const update = {
            state,
            companyName,
            customerLeadId,
            packageId,
            userId: resolvedUserId,
            packageName,
            package: packageData,
            loginUserDetail,
            discountPercentage,
            accept: resolvedAccept,
            managerName
        };

        const existing = await DiscountApproval.findOne(filter);
        const discountApproval = await DiscountApproval.findOneAndUpdate(
            filter,
            { $set: update },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        const wasCreated = !existing;
        emitDiscountApprovalEvent(
            wasCreated ? 'discountapproval:created' : 'discountapproval:updated',
            discountApproval
        );

        return res.status(wasCreated ? 201 : 200).json({
            status: 'success',
            message: wasCreated ? 'Discount approval created successfully' : 'Discount approval updated successfully',
            data: discountApproval
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Discount approval already exists for this state, user, package, and customer lead' });
        }
        return res.status(500).json({ message: error.message });
    }
};

export const getAllDiscountApprovals = async (req, res) => {
    try {
        const { state, customerLeadId, packageId, userId } = req.query;
        const filter = {};

        if (state) filter.state = state;
        if (customerLeadId) filter.customerLeadId = customerLeadId;
        if (packageId) filter.packageId = packageId;
        if (userId) filter.userId = userId;

        const discountApprovals = await DiscountApproval.find(filter).sort({ createdAt: -1 });

        emitDiscountApprovalEvent('discountapproval:fetched', discountApprovals);

        return res.status(200).json({
            status: 'success',
            data: discountApprovals
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getDiscountApprovalById = async (req, res) => {
    try {
        const { id } = req.params;

        const discountApproval = await DiscountApproval.findById(id);
        if (!discountApproval) {
            return res.status(404).json({ message: 'Discount approval not found' });
        }

        emitDiscountApprovalEvent('discountapproval:fetchedOne', discountApproval);

        return res.status(200).json({
            status: 'success',
            data: discountApproval
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getByCustomerLeadId = async (req, res) => {
    try {
        const { customerLeadId, userId, packageId } = req.params;

        if (!customerLeadId || !userId || !packageId) {
            return res.status(400).json({
                message: 'customerLeadId, userId, and packageId are required'
            });
        }

        const discountApprovals = await DiscountApproval.find({
            customerLeadId,
            userId,
            packageId
        }).sort({ createdAt: -1 });

        emitDiscountApprovalEvent('discountapproval:fetchedByCustomerLead', discountApprovals);

        return res.status(200).json({
            status: 'success',
            data: discountApprovals
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getByPackageId = async (req, res) => {
    try {
        const { packageId } = req.params;

        const discountApprovals = await DiscountApproval.find({ packageId }).sort({ createdAt: -1 });

        emitDiscountApprovalEvent('discountapproval:fetchedByPackage', discountApprovals);

        return res.status(200).json({
            status: 'success',
            data: discountApprovals
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getByUserId = async (req, res) => {
    try {
        const { userId } = req.params;

        const discountApprovals = await DiscountApproval.find({ userId }).sort({ createdAt: -1 });

        emitDiscountApprovalEvent('discountapproval:fetchedByUser', discountApprovals);

        return res.status(200).json({
            status: 'success',
            data: discountApprovals
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const companySummarySelect = 'packageName state discountPercentage loginUserDetail';

export const getByCompanyName = async (req, res) => {
    try {
        const { companyName } = req.params;

        if (!companyName) {
            return res.status(400).json({ message: 'companyName is required' });
        }

        const discountApprovals = await DiscountApproval.find({ companyName })
            .select(companySummarySelect)
            .sort({ createdAt: -1 });

        emitDiscountApprovalEvent('discountapproval:fetchedByCompany', {
            companyName,
            data: discountApprovals
        });

        return res.status(200).json({
            status: 'success',
            data: discountApprovals
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getByCompanyNamePending = async (req, res) => {
    try {
        const { companyName } = req.params;

        if (!companyName) {
            return res.status(400).json({ message: 'companyName is required' });
        }

        const discountApprovals = await DiscountApproval.find({
            companyName,
            accept: 'pending'
        })
            .select(companySummarySelect)
            .sort({ createdAt: -1 });

        emitDiscountApprovalEvent('discountapproval:fetchedByCompanyPending', {
            companyName,
            data: discountApprovals
        });

        return res.status(200).json({
            status: 'success',
            data: discountApprovals
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getByCompanyNameAccepted = async (req, res) => {
    try {
        const { companyName } = req.params;

        if (!companyName) {
            return res.status(400).json({ message: 'companyName is required' });
        }

        const discountApprovals = await DiscountApproval.find({
            companyName,
            accept: 'accepted'
        })
            .select(companySummarySelect)
            .sort({ createdAt: -1 });

        emitDiscountApprovalEvent('discountapproval:fetchedByCompanyAccepted', {
            companyName,
            data: discountApprovals
        });

        return res.status(200).json({
            status: 'success',
            data: discountApprovals
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateDiscountApproval = async (req, res) => {
    try {
        const { id } = req.params;

        const updated = await DiscountApproval.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Discount approval not found' });
        }

        emitDiscountApprovalEvent('discountapproval:updated', updated);

        return res.status(200).json({
            status: 'success',
            data: updated
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateDiscountApprovalField = async (req, res) => {
    try {
        const { id } = req.params;
        const { updateFields } = req.body;

        if (!updateFields || typeof updateFields !== 'object' || Array.isArray(updateFields)) {
            return res.status(400).json({ message: 'updateFields object is required' });
        }

        const updated = await DiscountApproval.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Discount approval not found' });
        }

        emitDiscountApprovalEvent('discountapproval:updated', updated);

        return res.status(200).json({
            status: 'success',
            data: updated
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const deleteDiscountApproval = async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await DiscountApproval.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: 'Discount approval not found' });
        }

        emitDiscountApprovalEvent('discountapproval:deleted', { id });

        return res.status(200).json({
            status: 'success',
            message: 'Discount approval deleted successfully',
            data: { id }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const deleteAllDiscountApprovals = async (req, res) => {
    try {
        const result = await DiscountApproval.deleteMany({});

        emitDiscountApprovalEvent('discountapproval:deletedAll', {
            deletedCount: result.deletedCount
        });

        return res.status(200).json({
            status: 'success',
            message: `Successfully deleted ${result.deletedCount} discount approval(s)`,
            data: {
                deletedCount: result.deletedCount
            }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
