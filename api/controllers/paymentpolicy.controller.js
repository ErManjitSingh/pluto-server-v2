import PaymentPolicy from '../models/paymentpolicy.model.js';

export const createPaymentPolicy = async (req, res) => {
    try {
        const { state } = req.body;

        if (!state) {
            return res.status(400).json({ message: 'State is required' });
        }

        const existing = await PaymentPolicy.findOne({ state });
        if (existing) {
            return res.status(400).json({
                message: `Payment policy already exists for ${state}. Use update API instead.`
            });
        }

        const newPolicy = new PaymentPolicy(req.body);
        const saved = await newPolicy.save();
        return res.status(201).json({
            status: 'success',
            data: saved
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updatePaymentPolicy = async (req, res) => {
    try {
        const { state } = req.params;

        if (!state) {
            return res.status(400).json({ message: 'State is required' });
        }

        const updated = await PaymentPolicy.findOneAndUpdate(
            { state },
            req.body,
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({
                message: `No payment policy found for ${state}`
            });
        }

        return res.status(200).json({
            status: 'success',
            data: updated
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getPaymentPolicy = async (req, res) => {
    try {
        const { state } = req.query;

        if (state) {
            const policy = await PaymentPolicy.findOne({ state });
            if (!policy) {
                return res.status(404).json({ message: `No payment policy found for ${state}` });
            }
            return res.status(200).json({
                status: 'success',
                data: policy
            });
        }

        const policies = await PaymentPolicy.find();
        if (!policies.length) {
            return res.status(404).json({ message: 'No payment policies found' });
        }
        return res.status(200).json({
            status: 'success',
            data: policies
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateGlobalPaymentPolicy = async (req, res) => {
    try {
        const { '1star': oneStar, '4star': fourStar } = req.body;

        if (!oneStar && !fourStar) {
            return res.status(400).json({
                message: 'At least one of 1star or 4star is required'
            });
        }

        const updateObj = {};
        if (oneStar) {
            updateObj['1star'] = oneStar;
        }
        if (fourStar) {
            updateObj['4star'] = fourStar;
        }

        const result = await PaymentPolicy.updateMany(
            {},
            { $set: updateObj },
            { runValidators: true }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: 'No payment policies found to update'
            });
        }

        const updatedPolicies = await PaymentPolicy.find();

        return res.status(200).json({
            status: 'success',
            message: `Successfully updated ${result.modifiedCount} state(s)`,
            data: {
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                paymentPolicies: updatedPolicies
            }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
