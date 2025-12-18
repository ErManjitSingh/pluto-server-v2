import express from 'express';
import {
  sendMessage,
  getConversation,
  getUserConversations,
  markAsRead,
  deleteMessage,
  getUnreadCount
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

export default router;
