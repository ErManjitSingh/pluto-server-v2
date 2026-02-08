import express from 'express';
import {
  sendMessage,
  getConversation,
  getUserConversations,
  markAsRead,
  deleteMessage,
  getUnreadCount,
  getChatByTeamLeaderId,
  getChatByManagerId,
  getAllChats
} from '../controllers/chat.controller.js';

const router = express.Router();

// Send a message (REST API endpoint)
router.post('/send-message', sendMessage);

// Get conversation between two users
router.get('/conversation/:userId1/:userId2', getConversation);

// Get all conversations for a user
router.get('/conversations/:userId', getUserConversations);

// Mark messages as read
router.put('/mark-read', markAsRead);

// Delete a message
router.delete('/delete-message/:messageId', deleteMessage);

// Get unread message count
router.get('/unread-count/:userId', getUnreadCount);

// Get chats by team leader ID
router.get('/team-leader/:teamleaderid', getChatByTeamLeaderId);

// Get chats by manager ID
router.get('/manager/:managerid', getChatByManagerId);

// Get all chats
router.get('/all', getAllChats);

export default router;
