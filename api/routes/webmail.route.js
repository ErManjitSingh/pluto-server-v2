import express from 'express';
import multer from 'multer';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  connectWebmail,
  getWebmailStatus,
  disconnectWebmail,
  sendWebmail,
  sendMailDemand,
  getInbox,
  getThread,
  markRead,
  downloadAttachment,
  syncNow,
  bulkImport,
  getSharedInbox,
  assignEmailToMaker,
  getMakerInbox,
  deleteEmail,
  deleteThread,
  bulkDelete,
  adminDeleteEmail,
  adminDeleteThread,
} from '../controllers/webmail.controller.js';

const router = express.Router();

// In-memory storage for outbound attachments. Total size limit 25 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

// Connection management (admin sets up the shared mailbox once with isShared: true)
router.post('/connect', verifyToken, connectWebmail);
router.get('/status', verifyToken, getWebmailStatus);
router.delete('/disconnect', verifyToken, disconnectWebmail);

// Send mail (every maker uses the shared mailbox under the hood)
router.post('/send', verifyToken, upload.array('attachments', 10), sendWebmail);

// Send mail from info@demandsetutours.com (no token / company required)
router.post('/send-demand', upload.array('attachments', 10), sendMailDemand);

// Maker's own inbox + threads
router.get('/inbox', verifyToken, getInbox);
router.get('/thread/:threadId', verifyToken, getThread);
router.patch('/read/:id', verifyToken, markRead);
router.get('/attachment/:id/:index', verifyToken, downloadAttachment);
router.post('/sync-now', verifyToken, syncNow);

// Delete (regular user — own emails only)
router.delete('/thread/:threadId', verifyToken, deleteThread);
router.post('/bulk-delete', verifyToken, bulkDelete);
router.delete('/:id', verifyToken, deleteEmail);

// Admin / Manager / Team Leader endpoints (gated by requireAdmin)
router.get('/admin/shared-inbox', verifyToken, requireAdmin, getSharedInbox);
router.patch('/admin/assign/:emailId', verifyToken, requireAdmin, assignEmailToMaker);
router.get('/admin/inbox/:makerId', verifyToken, requireAdmin, getMakerInbox);
router.post('/admin/bulk-import', verifyToken, requireAdmin, bulkImport);
router.delete('/admin/thread/:threadId', verifyToken, requireAdmin, adminDeleteThread);
router.delete('/admin/:id', verifyToken, requireAdmin, adminDeleteEmail);

export default router;
