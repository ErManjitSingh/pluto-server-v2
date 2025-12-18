import mongoose from 'mongoose';

const globalMasterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const GlobalMaster = mongoose.model('GlobalMaster', globalMasterSchema);

export default GlobalMaster;
