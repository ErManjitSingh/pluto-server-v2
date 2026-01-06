import express from 'express';
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  getTransactionsByLeadId,
  getAllTransactionsByLeadId,
  getTransactionByOperationId,
  getPendingOperationByOperationId,
  getPendingTransactions,
  getDualBankTransactions,
  getCabUserBankTransactions,
  getAutomaticHotelTransactions,
  getAutomaticCabTransactions,
  getTransactionsByToBankName,
  updateTransaction,
  deleteTransaction,
} from '../controllers/banktransactions.controller.js';

const router = express.Router();

// Create
router.post('/create', createTransaction);

// Read
router.get('/get', getTransactions);
router.get('/get/:id', getTransactionById);
router.get('/alllead/:leadId', getAllTransactionsByLeadId);
router.get('/lead/:leadId', getTransactionsByLeadId);
router.get('/operation/:operationId', getTransactionByOperationId);
router.get('/pendingoperation/:operationId', getPendingOperationByOperationId);
router.get('/pending', getPendingTransactions);
router.get('/dual-bank', getDualBankTransactions);
router.get('/cabuser-bank', getCabUserBankTransactions);
router.get('/automatic-hotel', getAutomaticHotelTransactions);
router.get('/automatic-cab', getAutomaticCabTransactions);
router.get('/to-bank-name/:toBankName', getTransactionsByToBankName);

// Update (PATCH)
router.patch('/update/:id', updateTransaction);

// Delete
router.delete('/delete/:id', deleteTransaction);

export default router;

