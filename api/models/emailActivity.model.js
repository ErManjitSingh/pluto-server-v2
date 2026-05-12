import mongoose from 'mongoose';

const emailActivitySchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: false,
    index: true
    // Optional: unassigned inbound emails still show up in the inbox
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Maker',
    required: true,
    index: true
  },
  gmailMessageId: {
    type: String,
    required: true
    // RFC 5322 Message-ID for cPanel/IMAP emails (kept name for backward compat)
  },
  gmailThreadId: {
    type: String,
    required: true,
    index: true
    // Our internal thread id (Message-ID of the root email of the conversation)
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
  cc: { type: String, default: '' },
  bcc: { type: String, default: '' },
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
    attachmentId: String,
    storagePath: String
    // storagePath: relative disk path under uploads/email-attachments/...
  }],
  imapUid: { type: Number, default: null },
  // Original IMAP UID on the mailbox (used for delete/move on server)
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
