import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
    roomName: {
        type: String,
        required: true
    },
    planName: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    ratePerNight: {
        type: Number,
        required: true,
        min: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    }
});

const guestDetailsSchema = new mongoose.Schema({
    adults: {
        type: Number,
        required: true,
        min: 1
    },
    children: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    }
});

const policiesSchema = new mongoose.Schema({
    checkInTime: {
        type: String,
        required: true
    },
    checkOutTime: {
        type: String,
        required: true
    },
    cancellationPolicy: {
        type: String,
        required: true
    },
    houseRules: {
        type: [String],
        default: []
    }
});

const bookingSchema = new mongoose.Schema({
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    checkInDate: {
        type: Date,
        required: true
    },
    checkOutDate: {
        type: Date,
        required: true
    },
    checkInTime: {
        type: String,
        required: true
    },
    checkOutTime: {
        type: String,
        required: true
    },
    numberOfNights: {
        type: Number,
        required: true,
        min: 1
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    rooms: {
        type: [roomSchema],
        required: true,
        validate: [array => array.length > 0, 'At least one room must be selected']
    },
    guestDetails: {
        type: guestDetailsSchema,
        required: true
    },
    policies: {
        type: policiesSchema,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    bookingReference: {
        type: String,
        unique: true
    }
}, {
    timestamps: true
});

// Pre-save middleware to generate booking reference
bookingSchema.pre('save', async function(next) {
    if (this.isNew) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.bookingReference = `BK${year}${month}${random}`;
    }
    next();
});

// Add validation for check-in and check-out dates
bookingSchema.pre('validate', function(next) {
    if (this.checkInDate >= this.checkOutDate) {
        this.invalidate('checkOutDate', 'Check-out date must be after check-in date');
    }
    next();
});

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;