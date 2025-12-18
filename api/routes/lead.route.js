import express from 'express';
import { 
  createLead, 
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
  transferLeadToUser,
  transferMultipleLeadsToUser,
  getLeadsByExecutivePhone
} from '../controllers/lead.controller.js';
import { verifyToken, verifyTokenOrCommon, verifySimpleToken } from '../utils/verifyUser.js';

const router = express.Router();

router.post('/create-lead', verifyToken, createLead);
router.get('/get-leads', verifyToken, getLeads);
router.get('/get-lead/:id', verifyToken, getLead);
router.put('/update-lead/:id', verifyToken ,  updateLead);
router.delete('/delete-lead/:id', verifyToken, deleteLead);
router.delete('/delete-leads', verifyToken, deleteMultipleLeads);

// Transfer routes for moving leads from static token to user token
router.put('/transfer-lead/:leadId', verifyToken, transferLeadToUser);
router.put('/transfer-leads', verifyToken, transferMultipleLeadsToUser);

router.post('/create-lead-flexible', verifyTokenOrCommon, createLead);
router.get('/get-leads-flexible', verifyTokenOrCommon, getLeads);
router.get('/get-lead-flexible/:id', verifyTokenOrCommon, getLead);

router.post('/crm-create-lead', verifySimpleToken, createLead);
router.get('/crm-get-leads', verifySimpleToken, getLeads);
router.get('/crm-get-leads-by-executive-phone', verifySimpleToken, getLeadsByExecutivePhone);
router.get('/crm-get-lead/:id', verifySimpleToken, getLead);
router.delete('/crm-delete-lead/:id', verifySimpleToken, deleteLead);
router.delete('/crm-delete-leads', verifySimpleToken, deleteMultipleLeads);

// Public routes without token authentication
router.get('/public/get-leads', getLeadsPublic);
router.get('/public/get-lead/:id', getLeadPublic);
router.put('/public/update-lead/:id', updateLeadPublic);
router.delete('/public/delete-lead/:id', deleteLeadPublic);
router.delete('/public/delete-leads', deleteMultipleLeadsPublic);

export default router;
