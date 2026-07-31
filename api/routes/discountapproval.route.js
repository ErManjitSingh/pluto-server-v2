import express from 'express';
import * as discountApprovalController from '../controllers/discountapproval.controller.js';

const router = express.Router();

router.post('/create', discountApprovalController.createDiscountApproval);
router.get('/get-all', discountApprovalController.getAllDiscountApprovals);
router.get('/get-by-id/:id', discountApprovalController.getDiscountApprovalById);
router.get('/get-by-customer-lead-id/:customerLeadId/:userId/:packageId', discountApprovalController.getByCustomerLeadId);
router.get('/get-by-package-id/:packageId', discountApprovalController.getByPackageId);
router.get('/get-by-user-id/:userId', discountApprovalController.getByUserId);
router.get('/get-by-company-name/:companyName', discountApprovalController.getByCompanyName);
router.get('/get-by-company-name-pending/:companyName', discountApprovalController.getByCompanyNamePending);
router.get('/get-by-company-name-accepted/:companyName', discountApprovalController.getByCompanyNameAccepted);
router.put('/update/:id', discountApprovalController.updateDiscountApproval);
router.put('/update-field/:id', discountApprovalController.updateDiscountApprovalField);
router.delete('/delete/:id', discountApprovalController.deleteDiscountApproval);
router.delete('/delete-all', discountApprovalController.deleteAllDiscountApprovals);

export default router;
