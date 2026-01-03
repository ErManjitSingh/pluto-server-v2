import mongoose from 'mongoose';

const operationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  operationAssignReportId:{
    type: String,
  },
  customerLeadId: {
   type: String,
  },
  finalAccepted:{
   type: String,
  },
   userId: {
  type: String,
  },
   notedata: [{
    type: {
      type: String,
      required: true
    },

    note: {
      type: String,
      required: true
    },
    rejectedbycustomer: {
      type: String,
      required: true
    },
    timestamp: {
      type: String,
      required: true
    },
    bookingId: {
      type: String,
      required: true
    }
  }],
  finalTotal: {
    type: Number,
    required: true
  },
  marginPercentage: {
    type: Number,
    required: true
  },
  discountPercentage:{
      type: Number,
    required: true
},
  timestamp: {
    type: String,
    required: true
  },

  total: {
    type: Number,
    required: true
  },
  converted: {
    type: Boolean,
    default: false
  },
      package: {
    type: mongoose.Schema.Types.Mixed
  },
  conversionType: {
    type: String,
    enum: ['ptw', 'demand setu', null],
    default: null
  },
 acceptanceData: {
    hotels: [{
    
      day: {
        type: Number,
      
      },
      image: {
        type: String,
        default: null
      },
      propertyName: {
        type: String,
      
      },
      status: {
        type: String,
        enum: ['accepted', 'rejected'],
       
      },
      timestamp: {
        type: String,
        
      }
    }],
    overallNote: {
      type: String,
      default: null
    },
    timestamp: {
      type: String,
    
    }
  },
  activities: [{
    type: mongoose.Schema.Types.Mixed
  }],
  hotels: [{
    type: mongoose.Schema.Types.Mixed,
    emailStatus: {
      messageId: String,
      status: {
        type: String,
        enum: ['sent', 'delivered', 'failed', 'bounced', 'rejected'],
        default: 'sent'
      },
      sentAt: Date,
      recipientResponse: {
        type: String,
        enum: ['accept', 'reject', null],
        default: null
      },
      respondedAt: Date,
      lastEvent: String,
      updatedAt: Date,
      rejectionReason: {
        type: String,
        default: null
      }
    }
  }],
  similarhotel: [{
    propertyName: {
      type: String,
      required: true
    },
    rating: {
      type: Number
    },
    day: {
      type: Number,
      required: true
    }
  }],
  editdetail: {
    transfer: {
      type: mongoose.Schema.Types.Mixed
    },
    hotels: [{
      type: mongoose.Schema.Types.Mixed
    }],
    activities: [{
      type: mongoose.Schema.Types.Mixed
    }],
    totals: {
      transferCost: {
        type: Number
      },
      hotelCost: {
        type: Number
      },
      activitiesCost: {
        type: Number
      },
      grandTotal: {
        type: Number
      }
    },
    finalTotal: {
      type: Number
    },
    marginPercentage: {
      type: Number
    },
    discountPercentage: {
      type: Number
    },
    timestamp: {
      type: String
    }
  },
  transfer: {
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    finalAccept:{
     type: String
    },
     itineraryDays: {
      type: mongoose.Schema.Types.Mixed
    }, 
    selectedLead: {
      type: mongoose.Schema.Types.Mixed
    },
      state: {
      type: String
    },
    totalCost: {
      type: Number
    },
    editTotal: {
      type: Number
    },
    editprice: {
      type: Number
    }
  },
  totals: {
    transferCost: {
      type: Number
    },
    hotelCost: {
      type: Number
    },
    activitiesCost: {
      type: Number
    },
    grandTotal: {
      type: Number
    }
  },
  emailStatus: {
    messageId: String,
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed', 'bounced', 'rejected'],
      default: 'sent'
    },
    sentAt: Date,
    recipientResponse: {
      type: String,
      enum: ['accept', 'reject', null],
      default: null
    },
    respondedAt: Date,
    lastEvent: String,
    updatedAt: Date,
    rejectionReason: {
      type: String,
      default: null
    }
  },
  leadVerification: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

// Indexes for performance optimization
operationSchema.index({ converted: 1, createdAt: -1 });
operationSchema.index({ id: 1, userId: 1, customerLeadId: 1 }); // Compound index for getOperationById
operationSchema.index({ id: 1 }); // Single field index for id
operationSchema.index({ userId: 1 }); // Single field index for userId
operationSchema.index({ customerLeadId: 1 }); // Single field index for customerLeadId
operationSchema.index({ operationAssignReportId: 1, createdAt: -1 }); // Compound index for getOperationByAssignReportId

const Operation = mongoose.model('operation', operationSchema);

export default Operation;
