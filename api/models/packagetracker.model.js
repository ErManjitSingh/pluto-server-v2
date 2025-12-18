import mongoose from 'mongoose';

const packageTrackerSchema = new mongoose.Schema({
  packageId: {
    type: String,
    required: true,
    index: true
  },
  packageName: {
    type: String,
    ref: 'Package',
    required: true
  },
  users: [{
    user: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    downloads: [{
      downloadType: {
        type: String,
        enum: ['pluto', 'demand-setu'],
        required: true
      },
      timestamp: {
        type: Date,
        required: true
      },
      downloadDate: {
        type: String,
        required: true
      }
    }]
  }],
  downloadCounts: {
    pluto: {
      type: Number,
      default: 0
    },
    'demand-setu': {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  }
}, { timestamps: true });

const PackageTracker = mongoose.model('PackageTracker', packageTrackerSchema);

export default PackageTracker;
