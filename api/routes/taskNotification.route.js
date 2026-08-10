import express from 'express';
import {
  createTaskNotification,
  getTaskNotifications,
  getTaskNotification,
  getTaskNotificationsByUser,
  markTaskNotificationSeen,
  deleteTaskNotification,
  deleteMultipleTaskNotifications
} from '../controllers/taskNotification.controller.js';

const router = express.Router();

router.post('/create', createTaskNotification);
router.get('/get-all', getTaskNotifications);
router.get('/get/:id', getTaskNotification);
router.get('/get-by-user/:userId', getTaskNotificationsByUser);
router.put('/mark-seen/:id', markTaskNotificationSeen);
router.delete('/delete/:id', deleteTaskNotification);
router.delete('/delete-multiple', deleteMultipleTaskNotifications);

export default router;
