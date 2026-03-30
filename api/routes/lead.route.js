import express from 'express';
import { 
  createLead, 
  crmCreateLead,
  getLeads, 
  getLead, 
  updateLead, 
  deleteLead, 
  deleteMultipleLeads,
  getLeadsPublic,
  getLeadPublic,
  updateLeadPublic,
  deleteLeadPublic,
  deleteMultipleLeadsPublic,
  deleteAllLeadsPublic,
  transferLeadToUser,
  transferMultipleLeadsToUser,
  getLeadsByExecutivePhone,
  getLeadEmails,
  getHelloHarshit,
  getAssignedLeads,
  getAssignedLeadsPtw,
  getAssignedLeadsDemand,
  createAssignedLead,
  updateAssignedLead,
  bulkUpdateAssignedUserId,
  bulkUpdateIsAssignedLeadPublic,
  deleteAssignedLead,
  updateLeadStatusNote,
  getLeadStatusNotificationsByUserId,
  getLeadStatusNotificationsByTeamLeaderId,
  getLeadStatusNotificationsByManagerId,
  markLeadStatusNotificationSeen,
  deleteLeadStatusNotification,
  markLeadStatusNoteSeen,
  syncMetaLeadsController,
  getLeadsByAssignedUserId
} from '../controllers/lead.controller.js';
import { verifyToken, verifyTokenOrCommon, verifySimpleToken } from '../utils/verifyUser.js';

const router = express.Router();

router.post('/create-lead', verifyToken, createLead);
router.get('/get-leads', verifyToken, getLeads);
router.get('/get-leads-by-assigned-user/:assignedUserId', getLeadsByAssignedUserId);
router.get('/get-lead/:id', verifyToken, getLead);
router.get('/get-lead/:leadId/emails', verifyToken, getLeadEmails);
router.put('/update-lead/:id', verifyToken ,  updateLead);
router.delete('/delete-lead/:id', verifyToken, deleteLead);
router.delete('/delete-leads', verifyToken, deleteMultipleLeads);

// Assigned leads API (only isAssignedLead: true; executive/team leader see their assigned leads)
router.get('/get-assigned-leads', getAssignedLeads);
router.get('/get-assigned-leads-ptw', getAssignedLeadsPtw);
router.get('/get-assigned-leads-demand', getAssignedLeadsDemand);
router.post('/create-assigned-lead', createAssignedLead);
router.put('/update-assigned-lead/:id',  updateAssignedLead);
router.put('/update-assigned-leads-bulk', bulkUpdateAssignedUserId);
router.delete('/delete-assigned-lead/:id',  deleteAssignedLead);

// Transfer routes for moving leads from static token to user token
router.put('/transfer-lead/:leadId', verifyToken, transferLeadToUser);
router.put('/transfer-leads', verifyToken, transferMultipleLeadsToUser);

router.post('/create-lead-flexible', verifyTokenOrCommon, createLead);
router.get('/get-leads-flexible', verifyTokenOrCommon, getLeads);
router.get('/get-lead-flexible/:id', verifyTokenOrCommon, getLead);

router.post('/crm-create-lead', verifySimpleToken, crmCreateLead);
router.get('/crm-get-leads', verifySimpleToken, getLeads);
router.get('/crm-get-leads-by-executive-phone', verifySimpleToken, getLeadsByExecutivePhone);
router.get('/crm-get-lead/:id', verifySimpleToken, getLead);
router.delete('/crm-delete-lead/:id', verifySimpleToken, deleteLead);
router.delete('/crm-delete-leads', verifySimpleToken, deleteMultipleLeads);

// Public routes without token authentication
router.get('/public/get-leads', getLeadsPublic);
router.get('/public/get-lead/:id', getLeadPublic);
router.put('/public/update-lead/:id', updateLeadPublic);
router.put('/public/bulk-update-is-assigned-lead', bulkUpdateIsAssignedLeadPublic);
router.delete('/public/delete-lead/:id', deleteLeadPublic);
router.delete('/public/delete-leads', deleteMultipleLeadsPublic);
router.delete('/public/delete-all-leads', deleteAllLeadsPublic);
router.get('/hello-harshit', getHelloHarshit);

// Meta lead sync: manual trigger (scheduled sync runs every 3 min via scheduledTasks)
router.get('/sync-meta-leads', syncMetaLeadsController);

// Lead status note & notifications (no change to existing logic)
router.put('/update-lead-status-note/:id', updateLeadStatusNote);
router.put('/mark-lead-status-notification-seen/:id', markLeadStatusNotificationSeen);
router.put('/mark-lead-status-note-seen/:leadId/:noteId', markLeadStatusNoteSeen);
router.get('/get-lead-status-notifications-by-user/:userId', getLeadStatusNotificationsByUserId);
router.get('/get-lead-status-notifications-by-teamleader/:teamLeaderId', getLeadStatusNotificationsByTeamLeaderId);
router.get('/get-lead-status-notifications-by-manager/:managerId', getLeadStatusNotificationsByManagerId);
router.delete('/delete-lead-status-notification/:id', deleteLeadStatusNotification);

export default router;
