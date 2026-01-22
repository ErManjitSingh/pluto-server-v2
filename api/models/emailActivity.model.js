import mongoose from 'mongoose';

const emailActivitySchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Maker',
    required: true
  },
  gmailMessageId: {
    type: String,
    required: true
    // Unique per user (compound index below)
  },
  gmailThreadId: {
    type: String,
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['INBOUND', 'OUTBOUND'],
    required: true
  },
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    default: ''
  },
  body: {
    type: String,
    default: ''
  },
  htmlBody: {
    type: String,
    default: ''
  },
  attachments: [{
    filename: String,
    mimeType: String,
    size: Number,
    attachmentId: String
  }],
  isRead: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index for faster queries
emailActivitySchema.index({ leadId: 1, createdAt: -1 });
emailActivitySchema.index({ gmailThreadId: 1 });

// Compound unique index: gmailMessageId per user (prevents cross-user conflicts)
emailActivitySchema.index(
  { gmailMessageId: 1, userId: 1 },
  { unique: true }
);

const EmailActivity = mongoose.model('EmailActivity', emailActivitySchema);

export default EmailActivity;
