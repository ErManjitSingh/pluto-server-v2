import express from 'express';
import {
  createTargetManagement,
  getTargetManagements,
  getTargetManagement,
  getTargetManagementsByUserId,
  getTargetManagementsByTeamLeaderId,
  getTargetManagementsByManagerId,
  updateTargetManagement,
  deleteTargetManagement,
} from '../controllers/targetmanagement.controller.js';

const router = express.Router();

router.post('/create', createTargetManagement);
router.get('/get-all', getTargetManagements);
router.get('/get-by-user/:userId', getTargetManagementsByUserId);
router.get('/get-by-teamleader/:teamLeaderId', getTargetManagementsByTeamLeaderId);
router.get('/get-by-manager/:managerId', getTargetManagementsByManagerId);
router.get('/get/:id', getTargetManagement);
router.put('/update/:id', updateTargetManagement);
router.delete('/delete/:id', deleteTargetManagement);

export default router;
