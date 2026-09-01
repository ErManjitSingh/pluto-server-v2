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
  },
  { timestamps: true }
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });

const AiConversation = mongoose.model('AiConversation', aiConversationSchema);
export default AiConversation;
