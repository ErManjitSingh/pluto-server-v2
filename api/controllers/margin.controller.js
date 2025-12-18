import Margin from '../models/margin.model.js';

export const createMargin = async (req, res) => {
    try {
        const { state } = req.body;
        
        if (!state) {
            return res.status(400).json({ message: 'State is required' });
        }

        // Check if margin already exists for this state
        const existingMargin = await Margin.findOne({ state });
        if (existingMargin) {
            return res.status(400).json({ 
                message: `Margin settings already exist for ${state}. Use update API instead.` 
            });
        }

        // Create new document
        const newMargin = new Margin(req.body);
        const savedMargin = await newMargin.save();
        return res.status(201).json({
            status: 'success',
            data: savedMargin
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateMargin = async (req, res) => {
    try {
        const { state } = req.params;
        
        if (!state) {
            return res.status(400).json({ message: 'State is required' });
        }

        // Find and update the margin
        const updatedMargin = await Margin.findOneAndUpdate(
            { state },
            req.body,
            { 
                new: true,
                runValidators: true 
            }
        );

        if (!updatedMargin) {
            return res.status(404).json({ 
                message: `No margin settings found for ${state}` 
            });
        }

        return res.status(200).json({
            status: 'success',
            data: updatedMargin
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateEditDiscount = async (req, res) => {
    try {
        const { state } = req.params;
        const { editDiscount } = req.body;

        if (!state) {
            return res.status(400).json({ message: 'State is required' });
        }
        if (!editDiscount) {
            return res.status(400).json({ message: 'editDiscount is required' });
        }

        // Always work with an array for consistency
        const discounts = Array.isArray(editDiscount) ? editDiscount : [editDiscount];
        let updatedMargin;

        for (const discount of discounts) {
            // Try to update existing entry (match on both userId and packageId)
            updatedMargin = await Margin.findOneAndUpdate(
                {
                    state,
                    'minimumQuoteMargins.editDiscount.loginUserDetail.userId': discount.loginUserDetail.userId,
                    'minimumQuoteMargins.editDiscount.packageId': discount.packageId
                },
                {
                    $set: {
                        'minimumQuoteMargins.editDiscount.$': discount
                    }
                },
                { new: true }
            );

            // If not found, push as new entry
            if (!updatedMargin) {
                updatedMargin = await Margin.findOneAndUpdate(
                    { state },
                    { $push: { 'minimumQuoteMargins.editDiscount': discount } },
                    { new: true, runValidators: true }
                );
            }
        }

        if (!updatedMargin) {
            return res.status(404).json({ message: `No margin settings found for ${state}` });
        }
        return res.status(200).json({
            status: 'success',
            data: updatedMargin
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateEditDiscountField = async (req, res) => {
    try {
        const { state } = req.params;
        const { editDiscountId, updateFields } = req.body;

        if (!state || !editDiscountId || !updateFields) {
            return res.status(400).json({ message: 'state, editDiscountId, and updateFields are required' });
        }

        // Build the update object dynamically
        const updateObj = {};
        for (const [key, value] of Object.entries(updateFields)) {
            updateObj[`minimumQuoteMargins.editDiscount.$.${key}`] = value;
        }

        const updatedMargin = await Margin.findOneAndUpdate(
            { state, 'minimumQuoteMargins.editDiscount._id': editDiscountId },
            { $set: updateObj },
            { new: true }
        );

        if (!updatedMargin) {
            return res.status(404).json({ message: 'No matching editDiscount found' });
        }

        return res.status(200).json({
            status: 'success',
            data: updatedMargin
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getMargin = async (req, res) => {
    try {
        const { state } = req.query;
        
        if (state) {
            // Get margin for specific state
            const margin = await Margin.findOne({ state });
            if (!margin) {
                return res.status(404).json({ message: `No margin settings found for ${state}` });
            }
            return res.status(200).json({
                status: 'success',
                data: margin
            });
        } else {
            // Get all margins
            const margins = await Margin.find();
            if (!margins.length) {
                return res.status(404).json({ message: 'No margin settings found' });
            }
            return res.status(200).json({
                status: 'success',
                data: margins
            });
        }
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const deleteEditDiscount = async (req, res) => {
    try {
        const { state } = req.params;
        const { editDiscountId } = req.body;

        if (!state) {
            return res.status(400).json({ message: 'State is required' });
        }
        if (!editDiscountId) {
            return res.status(400).json({ message: 'editDiscountId is required' });
        }

        // Remove the specific editDiscount object from the array
        const updatedMargin = await Margin.findOneAndUpdate(
            { state },
            { 
                $pull: { 
                    'minimumQuoteMargins.editDiscount': { _id: editDiscountId } 
                } 
            },
            { new: true }
        );

        if (!updatedMargin) {
            return res.status(404).json({ 
                message: `No margin settings found for ${state}` 
            });
        }

        // Check if the editDiscount was actually removed
        const discountExists = updatedMargin.minimumQuoteMargins.editDiscount.some(
            discount => discount._id.toString() === editDiscountId
        );

        if (discountExists) {
            return res.status(404).json({ 
                message: `No editDiscount found with id: ${editDiscountId}` 
            });
        }

        return res.status(200).json({
            status: 'success',
            message: 'EditDiscount deleted successfully',
            data: updatedMargin
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
