import HotelForm from '../models/hotelform.model.js';
import Property from '../models/packagemaker.model.js';

// Create new hotel form
export const create = async (req, res) => {
    try {
        // Validate hotel exists
        const hotel = await Property.findById(req.body.hotel);
     

        // Calculate total price including taxes
        const totalPrice = calculateTotalPrice(req.body);
        
      const hotelForm = new HotelForm({
            ...req.body,
            totalPrice: Number(req.body.totalPrice) // Convert string to number
        });

        const savedForm = await hotelForm.save();
        
        res.status(201).json({
            success: true,
            data: savedForm
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Get all hotel forms with filtering and pagination
export const getAll = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, hotel } = req.query;
        
        // Build query
        const query = {};
        if (status) query.bookingStatus = status;
        if (hotel) query.hotel = hotel;

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { createdAt: -1 },
            populate: {
                path: 'hotel',
                select: 'basicInfo.propertyName location.city'
            }
        };

        const hotelForms = await HotelForm.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('hotel', 'basicInfo.propertyName location.city')
            .sort('-createdAt');

        const total = await HotelForm.countDocuments(query);

        res.status(200).json({
            success: true,
            data: hotelForms,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get single hotel form by ID
export const getOne = async (req, res) => {
    try {
        const hotelForm = await HotelForm.findById(req.params.id)
            .populate('hotel', 'basicInfo.propertyName location.city');

        if (!hotelForm) {
            return res.status(404).json({
                success: false,
                message: 'Hotel form not found'
            });
        }

        res.status(200).json({
            success: true,
            data: hotelForm
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update hotel form
export const update = async (req, res) => {
    try {
        const hotelForm = await HotelForm.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!hotelForm) {
            return res.status(404).json({
                success: false,
                message: 'Hotel form not found'
            });
        }

        res.status(200).json({
            success: true,
            data: hotelForm
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Delete hotel form
export const deleteForm = async (req, res) => {
    try {
        const hotelForm = await HotelForm.findByIdAndDelete(req.params.id);

        if (!hotelForm) {
            return res.status(404).json({
                success: false,
                message: 'Hotel form not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Hotel form deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Helper function to calculate total price
const calculateTotalPrice = (formData) => {
    const basePrice = parseFloat(formData.basePrice);
    const extraBedCharges = parseFloat(formData.extraBedCharges || 0);
    const taxes = parseFloat(formData.taxes);
    
    return basePrice + extraBedCharges + taxes;
};

export default {
    create,
    getAll,
    getOne,
    update,
    delete: deleteForm
};
