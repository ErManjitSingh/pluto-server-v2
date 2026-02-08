import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  senderModel: {
    type: String,
    enum: ['Maker', 'Lead'],
    default: 'Maker'
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'senderModel',
    required: true
  },
  receiverModel: {
    type: String,
    enum: ['Maker', 'Lead'],
    default: 'Maker'
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'receiverModel',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  managerid: {
    type: String,
    default: null
  },
  managername: {
    type: String,
    default: null
  },
  teamleaderid: {
    type: String,
    default: null
  },
  teamleadername: {
    type: String,
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  conversationId: {
    type: String,
    required: true,
    index: true
  }
}, { timestamps: true });

// Indexes for faster queries
chatMessageSchema.index({ senderId: 1, receiverId: 1 });
chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ receiverId: 1, isRead: 1 }); // For unread count and mark as read
chatMessageSchema.index({ teamleaderid: 1, createdAt: -1 }); // For team leader queries
chatMessageSchema.index({ managerid: 1, createdAt: -1 }); // For manager queries
chatMessageSchema.index({ senderId: 1, createdAt: -1 }); // For user conversations
chatMessageSchema.index({ receiverId: 1, createdAt: -1 }); // For user conversations

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
export default ChatMessage;
