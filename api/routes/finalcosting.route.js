import express from 'express';
import {getOperationByMongoId,getOperationByMongoIdBase64,getConvertedOperationByIdAllData,updateEditdetail,getConvertedOperationsWithoutTransfer, getConvertedOperationsWithoutHotels,getConvertedOperationsWithoutTransferByLead,getConvertedOperationsWithoutHotelsByLead,deleteEditdetail,getConvertedOperationById,createOperation,updateOperationFields,getOperationById, getOperations,getConvertedOperations, getConvertedOperationsWithDetails, deleteOperation, updateOperation, updateEntireOperation, updateTransfer, sendOperationEmail, sendGroupHotelEmail, handleEmailResponse, handleGroupEmailResponse, handleEmailWebhook, updateNotedata, updateTransferDetailAtIndex, updateHotelAtIndex, updateLeadData, deleteOldNonConvertedOperations, updateOperationAssignReportId, getOperationByAssignReportId, getConvertedOperationsByCustomerLeadId, updateConvertedOperationByCustomerLeadId, getOperationSpecificFields, updateOperationSpecificFields, trackOperationOpened, convertOperationWithCategory, getConvertedOperationsByUserIdLite, initializePropertyNightsBooked, downloadOperationPdf, downloadOperationPdfDemandSetu } from '../controllers/finalcosting.controller.js';

const router = express.Router();

/** Large PDFs can take >60s; keep socket open + always send CORS (proxy errors look like CORS in browser). */
function pdfDownloadMiddleware(req, res, next) {
  req.headers['x-no-compression'] = '1';
  req.setTimeout(180000);
  res.setTimeout(180000);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Disposition, Content-Length, Content-Type, X-PDF-Cache, X-PDF-Time'
  );
  res.setHeader('Cache-Control', 'no-store');
  next();
}

router.post('/create', createOperation);
router.get('/get', getOperations);
router.get('/get/:id/:userId/:customerLeadId', getOperationById);
router.get('/pdf/:id/:userId/:customerLeadId', pdfDownloadMiddleware, downloadOperationPdf);
router.get(
  '/pdf-demandsetu/:id/:userId/:customerLeadId',
  pdfDownloadMiddleware,
  downloadOperationPdfDemandSetu
);
router.get('/get-by-id-base64/:encodedId', getOperationByMongoIdBase64);
router.get('/get-by-id/:id', getOperationByMongoId);
router.put('/update/:id', updateOperation);
router.put('/update-editdetail/:operationId', updateEditdetail);
router.delete('/delete-editdetail/:operationId', deleteEditdetail);
router.put('/updates/:id', updateOperationFields);
router.put('/update-notedata/:operationId', updateNotedata);
router.get('/get-converted-without-transfer', getConvertedOperationsWithoutTransfer);
router.get('/get-converted-without-hotels', getConvertedOperationsWithoutHotels);
router.get('/get-converted-without-transfer-by-lead', getConvertedOperationsWithoutTransferByLead);
router.get('/get-converted-without-hotels-by-lead', getConvertedOperationsWithoutHotelsByLead);
router.get('/get-converted', getConvertedOperations);
router.get('/get-converted-all-data/:id', getConvertedOperationByIdAllData);
router.get('/get-converted-details', getConvertedOperationsWithDetails);
router.put('/update-transfer/:id', updateTransfer);
router.put('/update-transfer-detail/:id', updateTransferDetailAtIndex);
router.get('/get-converted-details/:id', getConvertedOperationById);
router.put('/update-hotel/:id', updateHotelAtIndex);
router.put('/update-lead/:id', updateLeadData);
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
router.patch('/update-assign-report-id/:id', updateOperationAssignReportId);
router.get('/get-by-assign-report-id/:operationAssignReportId', getOperationByAssignReportId);
router.get('/get-converted-by-customer-lead-id/:customerLeadId', getConvertedOperationsByCustomerLeadId);
router.get('/get-converted-by-user-id/:userId', getConvertedOperationsByUserIdLite);
router.put('/update-converted-by-customer-lead-id/:customerLeadId', updateConvertedOperationByCustomerLeadId);
router.get('/get-specific-fields/:id', getOperationSpecificFields);
router.put('/update-specific-fields/:id', updateOperationSpecificFields);
router.post('/opened', trackOperationOpened);
router.put('/convert-with-category/:id', convertOperationWithCategory);
router.post('/initialize-property-nights-booked', initializePropertyNightsBooked);

export default router;
