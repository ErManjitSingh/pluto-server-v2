import mongoose from 'mongoose';

/**
 * One row per Maker that has webmail (cPanel) connected.
 * Replaces the old GmailToken model.
 *
 * Password is stored encrypted (AES-256-GCM) using utils/mailCrypto.js.
 * Never log or return `encryptedPassword` to the frontend.
 */
const mailAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Maker',
      required: true,
      index: true,
      // Admin who created the row. For shared mailbox = admin id.
      // For per-user mailbox = that maker id.
    },
    emailAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    isShared: {
      type: Boolean,
      default: false,
      index: true,
      // true = mailbox shared by all makers of one company
      // false = personal mailbox owned only by `userId` (legacy mode)
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
      // Which company this mailbox belongs to. Must match Maker.companyName
      // for makers of this company to send/receive through it.
    },
    displayName: {
      type: String,
      default: '',
      trim: true,
    },
    encryptedPassword: {
      type: String,
      required: true,
      select: false,
    },
    imapHost: { type: String, required: true, default: 'mail.ptwholidays.com' },
    imapPort: { type: Number, required: true, default: 993 },
    imapSecure: { type: Boolean, required: true, default: true },

    smtpHost: { type: String, required: true, default: 'mail.ptwholidays.com' },
    smtpPort: { type: Number, required: true, default: 465 },
    smtpSecure: { type: Boolean, required: true, default: true },

    signature: { type: String, default: '' },

    // Incremental IMAP sync cursor
    lastUid: { type: Number, default: 0 },
    lastSyncAt: { type: Date, default: null },
    lastSyncStatus: {
      type: String,
      enum: ['ok', 'error', 'never'],
      default: 'never',
    },
    syncError: { type: String, default: '' },
    consecutiveFailures: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

mailAccountSchema.index({ isActive: 1 });
// Allow only ONE shared mailbox per company (e.g. one for PTW, one for Demand Setu)
mailAccountSchema.index(
  { isShared: 1, companyName: 1 },
  { unique: true, partialFilterExpression: { isShared: true } }
);

const MailAccount = mongoose.model('MailAccount', mailAccountSchema);
export default MailAccount;
