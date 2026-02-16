import express from 'express';
import * as paymentPolicyController from '../controllers/paymentpolicy.controller.js';

const router = express.Router();

router.post('/create', paymentPolicyController.createPaymentPolicy);
router.put('/update/:state', paymentPolicyController.updatePaymentPolicy);
router.get('/get-payment-policy', paymentPolicyController.getPaymentPolicy);
router.put('/update-global', paymentPolicyController.updateGlobalPaymentPolicy);

export default router;
