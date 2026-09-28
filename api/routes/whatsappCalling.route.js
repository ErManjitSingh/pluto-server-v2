import express from 'express';
import fs from 'fs';
import {
  WhatsappCallError,
  acceptCall,
  connectOutgoingCall,
  getCall,
  getCallPermission,
  listActiveCalls,
  listCallsByPhone,
  preAcceptCall,
  recordingFileForToken,
  sendCallPermissionRequest,
  rejectCall,
  terminateCall,
} from '../services/whatsappCalling.service.js';

function sendError(res, err) {
  const status = err instanceof WhatsappCallError ? err.status : err.status || 500;
  if (status >= 500) console.error('WhatsApp call route error:', err);
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    details: err.details || undefined,
  });
}

/**
 * Call control for one existing WhatsApp line.
 * Mounted at /api/whatsapp and /api/whatsapp-demand without changing message routes.
 *
 * Socket events (only the assigned executive's user room):
 * - whatsapp:call:incoming | whatsapp-demand:call:incoming
 * - whatsapp:call:updated  | whatsapp-demand:call:updated
 * - whatsapp:call:ended    | whatsapp-demand:call:ended
 * - whatsapp:call:recording | whatsapp-demand:call:recording
 */
export function createWhatsappCallingRouter(line) {
  const router = express.Router();

  router.get('/calls/active', async (req, res) => {
    try {
      const calls = await listActiveCalls(line, req.query.executiveId);
      res.json({ success: true, calls });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/calls/permission', async (req, res) => {
    try {
      const permission = await getCallPermission(line, req.query.phone);
      res.json({ success: true, permission });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/calls/by-phone/:phone', async (req, res) => {
    try {
      const calls = await listCallsByPhone(line, req.params.phone, req.query.limit);
      res.json({ success: true, calls });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/calls/recording/:token', async (req, res) => {
    try {
      const file = await recordingFileForToken(req.params.token);
      if (!file) return res.status(404).end();
      if (file.redirectUrl) return res.redirect(file.redirectUrl);
      res.setHeader('Content-Type', file.mimeType || 'audio/ogg');
      res.setHeader('Content-Disposition', 'inline; filename="call-recording.ogg"');
      fs.createReadStream(file.filePath).pipe(res);
    } catch (err) {
      console.error('WhatsApp call recording GET error:', err);
      if (!res.headersSent) res.status(500).end();
    }
  });

  router.get('/calls/:id', async (req, res) => {
    try {
      const call = await getCall(line, req.params.id);
      res.json({ success: true, call });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/calls/connect', async (req, res) => {
    try {
      const call = await connectOutgoingCall(line, {
        phone: req.body?.phone,
        sdp: req.body?.sdp,
        executiveId: req.body?.executiveId,
      });
      res.json({ success: true, call });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/calls/permission-request', async (req, res) => {
    try {
      const result = await sendCallPermissionRequest(line, {
        phone: req.body?.phone,
        executiveId: req.body?.executiveId,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/calls/pre-accept', async (req, res) => {
    try {
      const call = await preAcceptCall(line, {
        callId: req.body?.callId,
        metaCallId: req.body?.metaCallId,
        sdp: req.body?.sdp,
        executiveId: req.body?.executiveId,
      });
      res.json({ success: true, call });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/calls/accept', async (req, res) => {
    try {
      const call = await acceptCall(line, {
        callId: req.body?.callId,
        metaCallId: req.body?.metaCallId,
        sdp: req.body?.sdp,
        executiveId: req.body?.executiveId,
      });
      res.json({ success: true, call });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/calls/reject', async (req, res) => {
    try {
      const call = await rejectCall(line, {
        callId: req.body?.callId,
        metaCallId: req.body?.metaCallId,
        executiveId: req.body?.executiveId,
      });
      res.json({ success: true, call });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/calls/terminate', async (req, res) => {
    try {
      const call = await terminateCall(line, {
        callId: req.body?.callId,
        metaCallId: req.body?.metaCallId,
        executiveId: req.body?.executiveId,
      });
      res.json({ success: true, call });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
