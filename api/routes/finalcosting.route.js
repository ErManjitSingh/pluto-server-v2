import express from 'express';
import {getOperationByMongoId,getConvertedOperationByIdAllData,updateEditdetail,getConvertedOperationsWithoutTransfer, getConvertedOperationsWithoutHotels,deleteEditdetail,getConvertedOperationById,createOperation,updateOperationFields,getOperationById, getOperations,getConvertedOperations, getConvertedOperationsWithDetails, deleteOperation, updateOperation, updateEntireOperation, updateTransfer, sendOperationEmail, sendGroupHotelEmail, handleEmailResponse, handleGroupEmailResponse, handleEmailWebhook, updateNotedata, updateTransferDetailAtIndex, updateHotelAtIndex, deleteOldNonConvertedOperations } from '../controllers/finalcosting.controller.js';

const router = express.Router();

router.post('/create', createOperation);
router.get('/get', getOperations);
router.get('/get/:id/:userId/:customerLeadId', getOperationById);
router.get('/get-by-id/:id', getOperationByMongoId);
router.put('/update/:id', updateOperation);
router.put('/update-editdetail/:operationId', updateEditdetail);
router.delete('/delete-editdetail/:operationId', deleteEditdetail);
router.put('/updates/:id', updateOperationFields);
router.put('/update-notedata/:operationId', updateNotedata);
router.get('/get-converted-without-transfer', getConvertedOperationsWithoutTransfer);
router.get('/get-converted-without-hotels', getConvertedOperationsWithoutHotels);
router.get('/get-converted', getConvertedOperations);
router.get('/get-converted-all-data/:id', getConvertedOperationByIdAllData);
router.get('/get-converted-details', getConvertedOperationsWithDetails);
router.put('/update-transfer/:id', updateTransfer);
router.put('/update-transfer-detail/:id', updateTransferDetailAtIndex);
router.get('/get-converted-details/:id', getConvertedOperationById);
router.put('/update-hotel/:id', updateHotelAtIndex);
router.put('/update-entire/:id', updateEntireOperation);
router.delete('/delete/:id', deleteOperation);
router.post('/send-email', sendOperationEmail);
router.post('/send-group-email', sendGroupHotelEmail);
router.get('/email-response/:operationId/:response/:messageId', handleEmailResponse);
router.get('/email-response/:operationId/:response/:messageId/:reason', handleEmailResponse);
router.get('/group-email-response/:operationId/:response/:messageId', handleGroupEmailResponse);
router.get('/group-email-response/:operationId/:response/:messageId/:reason', handleGroupEmailResponse);
router.post('/email-webhook', handleEmailWebhook);
router.delete('/delete-old-non-converted', deleteOldNonConvertedOperations);

export default router;
