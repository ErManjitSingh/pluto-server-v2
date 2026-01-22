import mongoose from "mongoose";

const gmailTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Maker',
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    refreshToken: {
        type: String,
        required: true
    },
    scope: {
        type: String
        // Not required - Google sometimes returns scope in different order
    },
    isActive: {
        type: Boolean,
        default: true
    },
    watchExpiration: {
        type: Date,
        default: null
    },
    historyId: {
        type: String,
        default: null
        // For thread-aware delta syncing (future enhancement)
    },
    threadId: {
        type: String,
        default: null
        // For thread-aware syncing (future enhancement)
    }
}, { timestamps: true });

const GmailToken = mongoose.model('GmailToken', gmailTokenSchema);

export default GmailToken;
