import ChatMessage from '../models/chat.model.js';
import Maker from '../models/maker.model.js';
import Lead from '../models/lead.model.js';
import mongoose from 'mongoose';
import { errorHandler } from '../utils/error.js';

// Helper function to generate conversation ID
const getConversationId = (userId1, userId2) => {
  return [userId1, userId2].sort().join('_');
};

const getUserModel = (userType) => {
  return userType === 'Lead' ? Lead : Maker;
};

const userSelect = 'firstName lastName email name mobile leadId';

// Send a message (also used by REST API)
export const sendMessage = async (req, res, next) => {
  try {
    const {
      senderId,
      receiverId,
      message,
      messageType = 'text',
      senderModel = 'Maker',
      receiverModel = 'Maker',
      managerid,
      managername,
      teamleaderid,
      teamleadername
    } = req.body;

    if (!senderId || !receiverId || !message) {
      return next(errorHandler(400, 'SenderId, receiverId, and message are required'));
    }

    // Verify both users exist (using lean for faster queries)
    const SenderModel = getUserModel(senderModel);
    const ReceiverModel = getUserModel(receiverModel);

    const [sender, receiver] = await Promise.all([
      SenderModel.findById(senderId).lean().select('_id'),
      ReceiverModel.findById(receiverId).lean().select('_id')
    ]);

    if (!sender) {
      return next(errorHandler(404, 'Sender not found'));
    }
    if (!receiver) {
      return next(errorHandler(404, 'Receiver not found'));
    }

    const conversationId = getConversationId(senderId, receiverId);

    // Create and populate in one query
    const newMessage = await ChatMessage.create({
      senderId,
      receiverId,
      message,
      messageType,
      senderModel,
      receiverModel,
      managerid,
      managername,
      teamleaderid,
      teamleadername,
      conversationId
    });

    // Populate in single query instead of separate findById
    const populatedMessage = await ChatMessage.findById(newMessage._id)
      .populate('senderId', userSelect)
      .populate('receiverId', userSelect)
      .lean();

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
      .populate('senderId', userSelect)
      .populate('receiverId', userSelect)
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json(messages);
  } catch (error) {
    console.log('Get conversation error:', error);
    next(error);
  }
};

// Get all conversations for a user (optimized with aggregation)
export const getUserConversations = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return next(errorHandler(400, 'User ID is required'));
    }

    const userIdObj = mongoose.Types.ObjectId.isValid(userId) 
      ? new mongoose.Types.ObjectId(userId) 
      : userId;

    // Use aggregation pipeline for efficient grouping and counting
    const conversations = await ChatMessage.aggregate([
      {
        $match: {
          $or: [
            { senderId: userIdObj },
            { receiverId: userIdObj }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $expr: { $eq: ['$receiverId', userIdObj] } },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          conversationId: '$_id',
          lastMessage: 1,
          unreadCount: 1
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ]);

    // Populate sender and receiver for last messages
    const populatedConversations = await ChatMessage.populate(conversations, [
      { path: 'lastMessage.senderId', select: userSelect },
      { path: 'lastMessage.receiverId', select: userSelect }
    ]);

    // Transform to match expected format
    const result = populatedConversations.map(conv => {
      const otherUser = conv.lastMessage.senderId._id.toString() === userId
        ? conv.lastMessage.receiverId
        : conv.lastMessage.senderId;

      return {
        conversationId: conv.conversationId,
        otherUser,
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount
      };
    });

    return res.status(200).json(result);
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

// Get unread message count for a user (optimized with index)
export const getUnreadCount = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Use countDocuments with indexed fields for fast query
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

// Get chats by team leader ID
export const getChatByTeamLeaderId = async (req, res, next) => {
  try {
    const { teamleaderid } = req.params;

    if (!teamleaderid) {
      return next(errorHandler(400, 'Team leader ID is required'));
    }

    const messages = await ChatMessage.find({ teamleaderid })
      .populate('senderId', userSelect)
      .populate('receiverId', userSelect)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(messages);
  } catch (error) {
    console.log('Get chat by team leader ID error:', error);
    next(error);
  }
};

// Get chats by manager ID
export const getChatByManagerId = async (req, res, next) => {
  try {
    const { managerid } = req.params;

    if (!managerid) {
      return next(errorHandler(400, 'Manager ID is required'));
    }

    const messages = await ChatMessage.find({ managerid })
      .populate('senderId', userSelect)
      .populate('receiverId', userSelect)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(messages);
  } catch (error) {
    console.log('Get chat by manager ID error:', error);
    next(error);
  }
};
