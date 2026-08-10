import mongoose from 'mongoose';

const recipientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Maker',
      required: true,
      index: true
    },
    firstName: { type: String },
    lastName: { type: String },
    companyName: { type: String },
    userType: { type: String },
    seen: { type: Boolean, default: false },
    seenAt: { type: Date, default: null }
  },
  { _id: false }
);

const taskNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      default: ''
    },
    // all = both companies, company = ptw | demandsetu, users = specific makers
    targetType: {
      type: String,
      enum: ['all', 'company', 'users'],
      required: true
    },
    // Used when targetType === 'company' ('ptw' | 'demandsetu')
    company: {
      type: String,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Maker',
      required: true,
      index: true
    },
    createdByName: { type: String },
    createdByUserType: { type: String },
    // Resolved makers who should receive this task notification
    recipients: {
      type: [recipientSchema],
      default: []
    }
  },
  { timestamps: true }
);

taskNotificationSchema.index({ 'recipients.userId': 1, 'recipients.seen': 1 });
taskNotificationSchema.index({ targetType: 1, company: 1 });
taskNotificationSchema.index({ createdAt: -1 });

const TaskNotification = mongoose.model('TaskNotification', taskNotificationSchema);

export default TaskNotification;
