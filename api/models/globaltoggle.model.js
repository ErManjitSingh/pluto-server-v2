import mongoose from 'mongoose';

const globalToggleSchema = new mongoose.Schema({
    name: {
        type: String,
        default: 'globalToggle',
        unique: true
    },
    toggle: {
        type: Boolean,
        default: false,
        required: true
    }
}, { timestamps: true });

const GlobalToggle = mongoose.model('GlobalToggle', globalToggleSchema);

export default GlobalToggle;
