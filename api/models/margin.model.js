import mongoose from 'mongoose';
const editDiscountSchema = new mongoose.Schema({
    packageId: { type: String, required: true },
    packageName: { type: String, required: true },
    package:{
        type:mongoose.Schema.Types.Mixed,
        required:true
    },
    loginUserDetail: { type: mongoose.Schema.Types.Mixed, required: true },
    discountPercentage: { type: Number, required: true },
    accept: { type: String }, // or Boolean, as per your use
    managerName: { type: String, required: true }
}, { _id: true }); // _id is true by default, but explicit for clarity
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
        moreThan3Lakh: { type: String, required: true },
        editDiscount: [editDiscountSchema]
    }
}, { timestamps: true });

const Margin = mongoose.model('Margin', marginSchema);

export default Margin;
