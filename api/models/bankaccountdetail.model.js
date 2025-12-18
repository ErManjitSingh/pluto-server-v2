import mongoose from 'mongoose';

const bankAccountDetailSchema = new mongoose.Schema({
  bankName: {
    type: String,
    required: true,
    trim: true
  },
  accountNumber: {
    type: String,
    required: true,
    trim: true
  },
  in: {
    type: Number,
    default: 0
  },
  out: {
    type: Number,
    default: 0
  },
  totalamount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const BankAccountDetail = mongoose.model('BankAccountDetail', bankAccountDetailSchema);

export default BankAccountDetail;
