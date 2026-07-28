import express from 'express';
import multer from 'multer';
import {
  getMailboxes,
  getAdminInbox,
  getAdminMessage,
  downloadAdminAttachment,
  sendAdminMail,
  replyAdminMail,
} from '../controllers/adminMail.controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

/** Only run multer when client sends multipart (JSON send/reply still works). */
const optionalAttachments = (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return upload.array('attachments', 10)(req, res, next);
  }
  next();
};

// No auth token — admin fixed mailboxes only
router.get('/mailboxes', getMailboxes);
router.get('/inbox', getAdminInbox);
router.get('/message', getAdminMessage);
router.get('/attachment', downloadAdminAttachment);
router.post('/send', optionalAttachments, sendAdminMail);
router.post('/reply', optionalAttachments, replyAdminMail);

export default router;
