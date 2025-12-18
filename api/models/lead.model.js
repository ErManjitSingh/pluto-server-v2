import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
   leadId: {
    type: String,
    unique: true,
  },
   
   leadStatus:{
   type:String,
   },
   
  name: {
    type: String,
    required: false,
  },
     executiveName: {
      type: String,
      required: false
    },
     executiveEmail: {
      type: String,
      required: false
    },
     executivePhone: {
      type: String,
      required: false
    },
   FlightTrainTicket:{
      type: String,
      required: false
    },
    carVendorName: {
      type: String,
    },
     carVendorMobile: {
      type: String,
    },
  email: {
    type: String, 
  },
  mobile: {
    type: String,
    required: false
  },
  adults: String,
  kids: String,
  EP: String,
  days: String,
  destination: String,
  extraBeds: String,
  from: String,
  mealPlans: String,
  nights: String,
  noOfRooms: String,
  packageCategory: String,
  packageType: String,
  persons: String,
  publish: String,
  source: String,
    converted: {
    type: Boolean,
    default: false
  },
  totalAmount: {
    type: Number,
  },
    totalCost: {
    type: Number,
  },
  paidAmount: {
    type: Number,
  },
  remainingAmount: {
    type: Number,
  },
  gstAmount: {
    type: Number,
  },
  marginAmount: {
    type: Number,
  },
  marginPercentage: {
    type: Number,
  },
  discountAmount: {
    type: Number,
  },
  discountPercentage: {
    type: Number,
  },

  submittedAt: {
    type: Date,
    default: Date.now
  },
  travelDate: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  isCommonLead: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const Lead = mongoose.model('Lead', leadSchema);

export default Lead;
