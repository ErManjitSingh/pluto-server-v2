import express from 'express';
import {
    initiateGmailAuth,
    handleGmailCallback,
    sendGmailEmail,
    getGmailStatus,
    disconnectGmail,
    getGmailInbox,
    handleGmailWebhook
} from '../controllers/gmail.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// OAuth flow routes
router.get('/connect', verifyToken, initiateGmailAuth); // Initiate OAuth (requires auth)
router.get('/callback', handleGmailCallback); // OAuth callback (public, validates state)

// Webhook endpoint (NO AUTH - called by Google Pub/Sub)
router.post('/webhook', express.json(), handleGmailWebhook); // Gmail push notifications

// Email operations (require authentication)
router.post('/send', verifyToken, sendGmailEmail); // Send email

// Status and management (require authentication)
router.get('/status', verifyToken, getGmailStatus); // Get connection status
router.delete('/disconnect', verifyToken, disconnectGmail); // Disconnect Gmail

// Inbox operations (require authentication)
router.get('/inbox', verifyToken, getGmailInbox); // Get inbox emails

export default router;
