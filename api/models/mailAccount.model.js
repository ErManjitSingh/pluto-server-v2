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
      unique: true,
      index: true,
    },
    emailAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
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

const MailAccount = mongoose.model('MailAccount', mailAccountSchema);
export default MailAccount;
