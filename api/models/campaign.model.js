import mongoose from 'mongoose';

export const CAMPAIGN_CHANNELS = ['whatsapp', 'email'];
export const CAMPAIGN_STATUSES = ['draft', 'sending', 'completed', 'failed', 'cancelled'];
/** Which WhatsApp Business line to send from: main = /api/whatsapp, demand = /api/whatsapp-demand. */
export const WHATSAPP_LINES = ['main', 'demand'];

const whatsappConfigSchema = new mongoose.Schema(
  {
    line: { type: String, enum: WHATSAPP_LINES, default: 'main' },
    /** Meta-approved template name (templates live in Meta Business Manager, not in this DB). */
    templateName: { type: String, default: null },
    language: { type: String, default: 'en' },
    /**
     * Meta `template.components` array, passed through to the Cloud API.
     * Parameter text may contain {{name}}, {{mobile}} … which are rendered per lead.
     */
    components: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Human-readable copy of the template body, for showing in campaign history. */
    bodyPreview: { type: String, default: '' },
  },
  { _id: false }
);

const emailConfigSchema = new mongoose.Schema(
  {
    subject: { type: String, default: '' },
    /** Supports {{name}}, {{destination}} … placeholders rendered per lead. */
    html: { type: String, default: '' },
    text: { type: String, default: '' },
    /** Maker whose mailbox sends the campaign. Defaults to createdBy. */
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Maker', default: null },
    /** Inject open pixel + click redirects. Requires PUBLIC_BASE_URL. */
    trackOpens: { type: Boolean, default: true },
    trackClicks: { type: Boolean, default: true },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    channels: {
      type: [{ type: String, enum: CAMPAIGN_CHANNELS }],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one channel (whatsapp or email) is required',
      },
    },
    whatsapp: { type: whatsappConfigSchema, default: () => ({}) },
    email: { type: emailConfigSchema, default: () => ({}) },

    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },
    /** Brand the campaign belongs to ('ptw' | 'demand'), mirrors Lead.publish. */
    publish: { type: String, default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Maker', default: null, index: true },

    /** Denormalised recipient count so lists don't need a per-row count. */
    totalLeads: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

campaignSchema.index({ createdAt: -1 });

export default mongoose.model('Campaign', campaignSchema);
