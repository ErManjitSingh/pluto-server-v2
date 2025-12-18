import ChatMessage from '../models/chat.model.js';
import Maker from '../models/maker.model.js';
import { errorHandler } from '../utils/error.js';

// Helper function to generate conversation ID
const getConversationId = (userId1, userId2) => {
  return [userId1, userId2].sort().join('_');
};

// Send a message (also used by REST API)
export const sendMessage = async (req, res, next) => {
  try {
    const { senderId, receiverId, message, messageType = 'text' } = req.body;

    if (!senderId || !receiverId || !message) {
      return next(errorHandler(400, 'SenderId, receiverId, and message are required'));
    }

    // Verify both users exist
    const [sender, receiver] = await Promise.all([
      Maker.findById(senderId),
      Maker.findById(receiverId)
    ]);

    if (!sender) {
      return next(errorHandler(404, 'Sender not found'));
    }
    if (!receiver) {
      return next(errorHandler(404, 'Receiver not found'));
    }

    const conversationId = getConversationId(senderId, receiverId);

    const newMessage = await ChatMessage.create({
      senderId,
      receiverId,
      message,
      messageType,
      conversationId
    });

    const populatedMessage = await ChatMessage.findById(newMessage._id)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');

    return res.status(201).json(populatedMessage);
  } catch (error) {
    console.log('Send message error:', error);
    next(error);
  }
};

// Get conversation between two users
export const getConversation = async (req, res, next) => {
  try {
    const { userId1, userId2 } = req.params;

    if (!userId1 || !userId2) {
      return next(errorHandler(400, 'Both user IDs are required'));
    }

    const conversationId = getConversationId(userId1, userId2);

    const messages = await ChatMessage.find({ conversationId })
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: 1 });

    return res.status(200).json(messages);
  } catch (error) {
    console.log('Get conversation error:', error);
    next(error);
  }
};

// Get all conversations for a user
export const getUserConversations = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return next(errorHandler(400, 'User ID is required'));
    }

    // Get all unique conversation partners
    const messages = await ChatMessage.find({
      $or: [{ senderId: userId }, { receiverId: userId }]
    })
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Group by conversation and get last message
    const conversationsMap = new Map();

    messages.forEach(msg => {
      const conversationId = msg.conversationId;
      
      if (!conversationsMap.has(conversationId)) {
        const otherUser = msg.senderId._id.toString() === userId 
          ? msg.receiverId 
          : msg.senderId;

        conversationsMap.set(conversationId, {
          conversationId,
          otherUser,
          lastMessage: msg,
          unreadCount: 0
        });
      }

      // Count unread messages
      if (msg.receiverId._id.toString() === userId && !msg.isRead) {
        conversationsMap.get(conversationId).unreadCount++;
      }
    });

    const conversations = Array.from(conversationsMap.values());

    return res.status(200).json(conversations);
  } catch (error) {
    console.log('Get user conversations error:', error);
    next(error);
  }
};

// Mark messages as read
export const markAsRead = async (req, res, next) => {
  try {
    const { conversationId, userId } = req.body;

    if (!conversationId || !userId) {
      return next(errorHandler(400, 'ConversationId and userId are required'));
    }

    const result = await ChatMessage.updateMany(
      { 
        conversationId, 
        receiverId: userId,
        isRead: false 
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    return res.status(200).json({ 
      message: 'Messages marked as read',
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.log('Mark as read error:', error);
    next(error);
  }
};

// Delete a message
export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const message = await ChatMessage.findByIdAndDelete(messageId);
    
    if (!message) {
      return next(errorHandler(404, 'Message not found'));
    }

    return res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.log('Delete message error:', error);
    next(error);
  }
};

// Get unread message count for a user
export const getUnreadCount = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const count = await ChatMessage.countDocuments({
      receiverId: userId,
      isRead: false
    });

    return res.status(200).json({ unreadCount: count });
  } catch (error) {
    console.log('Get unread count error:', error);
    next(error);
  }
};
