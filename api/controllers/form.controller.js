import Form from '../models/form.model.js';

// Submit multiple forms
export const submitFormHandler = async (req, res) => {
    const formData = Array.isArray(req.body) ? req.body : [req.body];
    
    try {
        // Validate all entries
        for (const entry of formData) {
            const { customerInfo, bookingDetails, bookingDate } = entry;
            
            // Validate customer info
            if (!customerInfo?.name || !customerInfo?.email || !customerInfo?.contact) {
                return res.status(400).json({ 
                    message: 'All customer information fields (name, email, contact) are required' 
                });
            }

            // Validate essential booking details
            if (!bookingDetails?.address || !bookingDetails?.checkInDate || 
                !bookingDetails?.checkOutDate || !bookingDetails?.selectedRooms) {
                return res.status(400).json({ 
                    message: 'Essential booking details are missing' 
                });
            }

            if (!bookingDate) {
                return res.status(400).json({ 
                    message: 'Booking date is required' 
                });
            }
        }

        // Insert multiple documents
        const savedForms = await Form.insertMany(formData);

        res.status(201).json({ 
            message: 'Bookings submitted successfully',
            forms: savedForms
        });
    } catch (error) {
        res.status(500).json({ message: 'Error submitting bookings', error });
    }
};

// Get all form submissions
export const getFormsHandler = async (req, res) => {
    try {
        const forms = await Form.find().sort({ createdAt: -1 });
        res.json(forms);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching forms', error });
    }
};

// Delete form submission
export const deleteFormHandler = async (req, res) => {
    const { id } = req.params;
    
    try {
        const form = await Form.findByIdAndDelete(id);
        
        if (!form) {
            return res.status(404).json({ message: 'Form not found' });
        }
        
        res.status(200).json({ message: 'Form deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting form', error });
    }
};
