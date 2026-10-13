import express from 'express';
import {
  createTargetManagement,
  getTargetManagements,
  getTargetManagement,
  getTargetManagementsByUserId,
  getTargetManagementsByTeamLeaderId,
  getTargetManagementsByManagerId,
  getTargetManagementsByCompanyName,
  updateTargetManagement,
  updateSpecificTarget,
  deleteSpecificTarget,
  deleteTargetManagement,
  deleteAllTargetManagement,
  upsertTargetAchieve,
  updateTargetAchieveReason,
  getTargetAchieveStatus,
  getTargetAchieveByUserId,
  getTargetAchieveByTeamLeaderId,
  getTargetAchieveByManagerId,
  deleteTargetAchieveDay,
} from '../controllers/targetmanagement.controller.js';

const router = express.Router();

router.post('/create', createTargetManagement);
router.get('/get-all', getTargetManagements);
router.get('/get-by-user/:userId', getTargetManagementsByUserId);
router.get('/get-by-teamleader/:teamLeaderId', getTargetManagementsByTeamLeaderId);
router.get('/get-by-manager/:managerId', getTargetManagementsByManagerId);
router.get('/get-by-company/:companyName', getTargetManagementsByCompanyName);
router.get('/get/:id', getTargetManagement);
router.put('/update/:id', updateTargetManagement);
router.put('/update-target/:targetId', updateSpecificTarget);
router.post('/achieve', upsertTargetAchieve);
router.put('/achieve/reason', updateTargetAchieveReason);
router.get('/achieve/status', getTargetAchieveStatus);
router.get('/achieve/by-user/:userId', getTargetAchieveByUserId);
router.get('/achieve/by-teamleader/:teamLeaderId', getTargetAchieveByTeamLeaderId);
router.get('/achieve/by-manager/:managerId', getTargetAchieveByManagerId);
router.delete('/achieve/:targetId/:date', deleteTargetAchieveDay);
router.delete('/delete-target/:targetId', deleteSpecificTarget);
router.delete('/delete-all', deleteAllTargetManagement);
router.delete('/delete/:id', deleteTargetManagement);

export default router;
