import mongoose from 'mongoose';

const aiMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['answer', 'need_more', 'confirm', 'error'],
      default: 'answer',
    },
  },
  { _id: false }
);

const pendingActionSchema = new mongoose.Schema(
  {
    tool: { type: String, required: true },
    args: { type: mongoose.Schema.Types.Mixed, required: true },
    confirmToken: { type: String, required: true },
    preview: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const draftPlaceSchema = new mongoose.Schema(
  {
    placeCover: { type: String, required: true },
    nights: { type: Number, default: 0 },
    transfer: { type: Boolean, default: false },
  },
  { _id: false }
);

const draftDaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    purpose: String,
    itineraryType: String,
    city: String,
    from: String,
    to: String,
    expectedTitle: String,
    itineraryId: String,
    itineraryTitle: String,
    /**
     * Options offered for a day that still needs a choice. Tool results are not
     * kept in the message history, so without this the ids are gone by the time
     * the user answers "the first one".
     */
    candidates: {
      type: [{ id: String, title: String }],
      default: [],
      _id: false,
    },
  },
  { _id: false }
);

/**
 * Policy text is never stored here. Only the GlobalMaster block name and the
 * edits the user asked for, so the stored HTML stays the single source.
 * removeIndices are 1-based, matching the numbering shown to the user.
 */
const draftPolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    removeIndices: { type: [Number], default: [] },
    addPoints: { type: [String], default: [] },
  },
  { _id: false }
);

const draftCabSchema = new mongoose.Schema(
  {
    cabId: { type: String, required: true },
    onSeasonPrice: { type: String, default: '' },
    offSeasonPrice: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * A package being assembled across several chat turns. It is kept on the
 * conversation instead of the message history because the history window is
 * trimmed and would drop the earliest decisions mid-build.
 */
const draftPackageSchema = new mongoose.Schema(
  {
    packageName: String,
    pickupLocation: String,
    dropLocation: String,
    duration: String,
    state: String,
    packageType: String,
    packageCategory: String,
    hotelCategory: String,
    themes: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    places: { type: [draftPlaceSchema], default: [] },
    days: { type: [draftDaySchema], default: [] },
    policies: { type: [draftPolicySchema], default: [] },
    cabs: { type: [draftCabSchema], default: [] },
    margins: {
      b2b: { type: Number, default: 5 },
      internal: { type: Number, default: 5 },
      website: { type: Number, default: 5 },
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const aiConversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    messages: {
      type: [aiMessageSchema],
      default: [],
    },
    pendingAction: {
      type: pendingActionSchema,
      default: null,
    },
    draftPackage: {
      type: draftPackageSchema,
      default: null,
    },
  },
  { timestamps: true }
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });

const AiConversation = mongoose.model('AiConversation', aiConversationSchema);
export default AiConversation;
