import mongoose from 'mongoose';

const leadCounterSchema = new mongoose.Schema({
  name: { type: String, default: 'leadSequence', unique: true },
  lastCounter: {
    type: Number,
    default: 0,
    required: true
  },
  // Controls which "type" is allocated next by getNextLeadIdAndPublish().
  // We keep lastCounter for backward compatibility, but gap-filling allocation uses nextPublish.
  nextPublish: {
    type: String,
    enum: ['ptw', 'demand'],
    default: 'ptw',
    required: true
  }
}, { timestamps: true });

const LeadCounter = mongoose.model('LeadCounter', leadCounterSchema);

export default LeadCounter;
