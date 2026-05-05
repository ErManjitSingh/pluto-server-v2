import express from 'express';
import {
  createTargetManagement,
  getTargetManagements,
  getTargetManagement,
  getTargetManagementsByUserId,
  getTargetManagementsByTeamLeaderId,
  getTargetManagementsByManagerId,
  updateTargetManagement,
  updateSpecificTarget,
  deleteSpecificTarget,
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
router.put('/update-target/:targetId', updateSpecificTarget);
router.delete('/delete-target/:targetId', deleteSpecificTarget);
router.delete('/delete/:id', deleteTargetManagement);

export default router;
