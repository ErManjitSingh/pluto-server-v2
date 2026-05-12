import express from 'express';
import multer from 'multer';
import { verifyToken } from '../middleware/auth.js';
import {
  connectWebmail,
  getWebmailStatus,
  disconnectWebmail,
  sendWebmail,
  getInbox,
  getThread,
  markRead,
  downloadAttachment,
  syncNow,
  bulkImport,
} from '../controllers/webmail.controller.js';

const router = express.Router();

// In-memory storage for outbound attachments. Total size limit 25 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

// Connection management
router.post('/connect', verifyToken, connectWebmail);
router.get('/status', verifyToken, getWebmailStatus);
router.delete('/disconnect', verifyToken, disconnectWebmail);

// Send mail (supports attachments via multipart/form-data, field name "attachments")
router.post('/send', verifyToken, upload.array('attachments', 10), sendWebmail);

// Inbox + threads
router.get('/inbox', verifyToken, getInbox);
router.get('/thread/:threadId', verifyToken, getThread);
router.patch('/read/:id', verifyToken, markRead);
router.get('/attachment/:id/:index', verifyToken, downloadAttachment);

// Manual refresh
router.post('/sync-now', verifyToken, syncNow);

// Admin bulk import — protect with an admin middleware in production
router.post('/admin/bulk-import', verifyToken, bulkImport);

export default router;
