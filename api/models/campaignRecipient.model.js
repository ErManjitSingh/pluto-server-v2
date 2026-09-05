import mongoose from 'mongoose';
import crypto from 'crypto';

export const WHATSAPP_RECIPIENT_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'];
export const EMAIL_RECIPIENT_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'failed',
];

const whatsappStateSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    status: { type: String, enum: WHATSAPP_RECIPIENT_STATUSES, default: 'pending' },
    /** The WhatsappMessage / WhatsappMessageDemand document created for this send. */
    messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Meta wamid — the join key used by the WhatsApp status webhook. */
    metaMessageId: { type: String, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const emailStateSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    status: { type: String, enum: EMAIL_RECIPIENT_STATUSES, default: 'pending' },
    /** The EmailActivity document, so campaign mail shows up in the lead's email history. */
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailActivity', default: null },
    messageId: { type: String, default: null },
    threadId: { type: String, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    clickedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    openCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    lastClickedUrl: { type: String, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const campaignRecipientSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },

    /** Snapshot of the lead at selection time — campaign reports stay stable if the lead changes. */
    leadName: { type: String, default: '' },
    leadEmail: { type: String, default: '' },
    leadPhone: { type: String, default: '' },

    /** Opaque id used in the open pixel / click redirect URLs. */
    trackingToken: {
      type: String,
      default: () => crypto.randomBytes(16).toString('hex'),
      unique: true,
      index: true,
    },

    whatsapp: { type: whatsappStateSchema, default: () => ({}) },
    email: { type: emailStateSchema, default: () => ({}) },
  },
  { timestamps: true }
);

campaignRecipientSchema.index({ campaignId: 1, leadId: 1 }, { unique: true });
campaignRecipientSchema.index({ 'whatsapp.metaMessageId': 1 });
campaignRecipientSchema.index({ campaignId: 1, 'whatsapp.status': 1 });
campaignRecipientSchema.index({ campaignId: 1, 'email.status': 1 });

export default mongoose.model('CampaignRecipient', campaignRecipientSchema);
