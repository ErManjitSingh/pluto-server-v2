import mongoose from 'mongoose';

const leadStatusNotificationSchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true,
    index: true
  },
  leadstatus: { type: String },
  note: { type: String },
  timing: { type: String },
  userid: { type: mongoose.Schema.Types.Mixed, index: true },
  teamleaderid: { type: mongoose.Schema.Types.Mixed, index: true },
  managerid: { type: mongoose.Schema.Types.Mixed, index: true },
  seen: { type: Boolean, default: false }
}, { timestamps: true });

leadStatusNotificationSchema.index({ userid: 1, seen: 1 });
leadStatusNotificationSchema.index({ teamleaderid: 1, seen: 1 });
leadStatusNotificationSchema.index({ managerid: 1, seen: 1 });

const LeadStatusNotification = mongoose.model('LeadStatusNotification', leadStatusNotificationSchema);

export default LeadStatusNotification;
