import express from 'express';
import {
  addCampaignLeads,
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  getAvailableLeads,
  getCampaign,
  getCampaignConfig,
  getCampaignRecipients,
  getCampaignStats,
  getCampaigns,
  getLeadCampaigns,
  getWhatsappTemplates,
  removeCampaignLeads,
  retryFailedCampaign,
  sendCampaign,
  trackEmailClick,
  trackEmailOpen,
  updateCampaign,
} from '../controllers/campaign.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Public — these URLs live inside emails already delivered to customers.
router.get('/track/open/:token', trackEmailOpen);
router.get('/track/click/:token', trackEmailClick);

// Static paths must be declared before /:id so they aren't swallowed by it.
router.get('/config', verifyToken, getCampaignConfig);
router.get('/whatsapp-templates', verifyToken, getWhatsappTemplates);
router.get('/available-leads', verifyToken, getAvailableLeads);
router.get('/lead/:leadId', verifyToken, getLeadCampaigns);

router.post('/', verifyToken, createCampaign);
router.get('/', verifyToken, getCampaigns);

router.get('/:id', verifyToken, getCampaign);
router.put('/:id', verifyToken, updateCampaign);
router.delete('/:id', verifyToken, deleteCampaign);

router.post('/:id/leads', verifyToken, addCampaignLeads);
router.delete('/:id/leads', verifyToken, removeCampaignLeads);

router.post('/:id/send', verifyToken, sendCampaign);
router.post('/:id/retry-failed', verifyToken, retryFailedCampaign);
router.post('/:id/cancel', verifyToken, cancelCampaign);

router.get('/:id/recipients', verifyToken, getCampaignRecipients);
router.get('/:id/stats', verifyToken, getCampaignStats);

export default router;
