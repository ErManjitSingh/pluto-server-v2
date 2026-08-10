import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
   leadId: {
    type: String,
  
  },
   
   leadStatus:{
   type:String,
   },
   leadstatusnote: [{
     leadstatus: { type: String },
     note: { type: String, required: false },
     timing: { type: String, required: false },
     userid: { type: mongoose.Schema.Types.Mixed },
     teamleaderid: { type: mongoose.Schema.Types.Mixed },
     managerid: { type: mongoose.Schema.Types.Mixed },
     seen: { type: Boolean, default: false },
     // Optional Google Calendar event id for this specific follow-up
     googleEventId: { type: String, required: false },
         createdAt: { type: Date, required: false }
   }],

  name: {
    type: String,
    required: false,
  },
     ageGroup: {
    type: String,
    required: false,
  },
  profession: {
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
    flightTrainTicketBooked:{
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
  isrepeated: {
    type: Boolean,
    default: false
  },
  adults: String,
  kids: String,
  EP: String,
  days: String,
  destination: String,
 guestLocation: String,
 foodPreference: String,
  budget: String,
  stayPreference: String,
  extraBeds: String,
  from: String,
  mealPlans: String,
  nights: String,
  noOfRooms: String,
  packageCategory: String,
  customerlastpackagecategory: String,
  laststaytype: String,
  lasttraveldestination: String,
  tourType: String,
  packageType: String,
  persons: String,
  publish: String,
  source: String,
  sourceFormId: { type: String, required: false },
  sourceFormName: { type: String, required: false },
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
  convertedDate: {
    type: Date,
    default: null
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
  },
  isAssignedLead: {
    type: Boolean,
    default: false
  },
  assignedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  assignmentHistory: [
    {
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
      },
      assignedAt: {
        type: Date,
        default: Date.now
      },
      unassignedAt: {
        type: Date,
        default: null
      }
    }
  ],
  reactivationCount: {
    type: Number,
    default: 0
  },
  reassignCount: {
    type: Number,
    default: 0
  },
 
  isseen: {
    type: Boolean,
    default: false
  },
  assignedAt: {
    type: Date,
    default: null
    // When lead was assigned to maker (for today/month counts)
  },
  // Optional Google Calendar event id for "new lead assigned" notification
  assignedGoogleEventId: {
    type: String,
    required: false
  },
  lead_meta_id: {
    type: String,
    unique: true,
    sparse: true
    // Unique prevents race-condition duplicates from Meta sync / CRM create
  },
  gmailThreadId: {
    type: String,
    index: true
    // For auto-linking emails to leads using Gmail threadId
  },
  lastEmailAt: {
    type: Date,
    default: null
    // Tracks last email activity for sorting hot leads
  }
}, { timestamps: true });

const Lead = mongoose.model('Lead', leadSchema);

export default Lead;
