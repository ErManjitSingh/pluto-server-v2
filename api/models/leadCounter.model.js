import mongoose from 'mongoose';

const leadCounterSchema = new mongoose.Schema({
  name: { type: String, default: 'leadSequence', unique: true },
  lastCounter: {
    type: Number,
    default: 0,
    required: true
  }
}, { timestamps: true });

const LeadCounter = mongoose.model('LeadCounter', leadCounterSchema);

export default LeadCounter;
