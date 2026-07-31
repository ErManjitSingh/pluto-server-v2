import mongoose from 'mongoose';

const marginSchema = new mongoose.Schema({
    state: {
        type: String,
        required: true,
        unique: true
    },
    firstQuoteMargins: {
        lessThan1Lakh: { type: String, required: true },
        between1To2Lakh: { type: String, required: true },
        between2To3Lakh: { type: String, required: true },
        moreThan3Lakh: { type: String, required: true }
    },
    minimumQuoteMargins: {
        lessThan1Lakh: { type: String, required: true },
        between1To2Lakh: { type: String, required: true },
        between2To3Lakh: { type: String, required: true },
        moreThan3Lakh: { type: String, required: true }
    }
}, { timestamps: true });

const Margin = mongoose.model('Margin', marginSchema);

export default Margin;
