import mongoose from 'mongoose';

const bankTransactionSchema = new mongoose.Schema(
  {
    // Primary bank (for single bank transactions or source bank for transfers)
    // Optional during creation (can be added later by accounts team)
    bank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccountDetail',
      required: false
    },
    bankName: {
      type: String,
    },
    accountNumber: {
      type: String,
    },
    
    // Secondary bank (for dual bank transactions - destination bank)
    toBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccountDetail',
      required: function() {
        return this.isDualBankTransaction === true;
      }
    },
    toBankName: {
      type: String,
    },
    operationId:{
    type: String,
    },
    totalHotelamount: {
      type: mongoose.Schema.Types.Mixed,
    },
     totalCabamount: {
      type: mongoose.Schema.Types.Mixed,
    },
    toAccountNumber: {
      type: String,
    },
    
    // Flag to indicate if this is a dual bank transaction
    isDualBankTransaction: {
      type: Boolean,
      default: false
    },
       automatichoteltransaction: {
      type: Boolean,
      default: false
    },
    automaticcabtransaction: {
      type: Boolean,
      default: false
    },
    
 hotelPayment: {
  type: Boolean,
  default: false
},
cabPayment: {
  type: Boolean,
  default: false
},
    
    // Payment type for primary bank (in/out)
    // Optional during creation, required when bank is assigned
    paymentType: {
      type: String,
      enum: ['in', 'out'],
      required: false
    },
    
    // Payment type for secondary bank (in/out) - for dual transactions
    toBankPaymentType: {
      type: String,
      enum: ['in', 'out'],
      required: function() {
        return this.isDualBankTransaction === true;
      }
    },
    
    leadId: {
      type: String,
    },
    leadName: {
      type: String,
    },
    travelDate: {
      type: String,
    },
    duration: {
      type: String,
    },
     destination: {
      type: String,
    },
    toAccount: {
      type: String,
      trim: true,
    },
      utrNumber: {
      type: String,
      trim: true,
    },
    image: {
      type: String, // Store image URL or file path
    },
    paymentMode: {
      type: String,
    },
    transactionAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    transactionId: {
      type: String,
      required: false, // Optional during creation, added by accounts team
    },
    transactionDate: {
      type: Date,
    },
    clearDate: {
      type: Date,
    },
    description: {
      type: String,
      trim: true,
    },
    accept: {
      type: Boolean,
    },
    // Lead amounts from the associated lead
    leadTotalAmount: {
      type: Number,
    },
    leadRemainingAmount: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

const BankTransaction = mongoose.model('BankTransaction', bankTransactionSchema);

export default BankTransaction;
