import express from 'express';
import {
  getNotificationUnreadCount,
  getNotificationsByUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/get-by-user/:userId', getNotificationsByUser);
router.get('/unread-count/:userId', getNotificationUnreadCount);
router.patch('/read/:id', markNotificationRead);
router.patch('/read-all/:userId', markAllNotificationsRead);

export default router;
