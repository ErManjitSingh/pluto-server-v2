import express from 'express';
import {
  createBankAccountDetail,
  getAllBankAccountDetails,
  getManualBankAccounts,
  getAutoCreatedBankAccounts,
  getBankAccountDetailById,
  updateBankAccountDetail,
  deleteBankAccountDetail,
  getAllBankTransactionsWithTotals,
  getTransactionsByBankId,
  recalculateAllBankTotals,
  updateBankTotalsForBank,
  autoCreateBanksFromProperties,
  autoCreateBanksFromCabUsers,
  getAutoCreatedBankAccountsFromCabUsers
} from '../controllers/bankaccountdetail.controller.js';

const router = express.Router();

// Create new bank account detail
router.post('/create', createBankAccountDetail);

// Get all bank account details
router.get('/get', getAllBankAccountDetails);

// Get only manually created bank accounts
router.get('/get-manual', getManualBankAccounts);

// Get only auto-created bank accounts from properties
router.get('/get-auto-created', getAutoCreatedBankAccounts);

// Get bank account detail by ID
router.get('/get/:id', getBankAccountDetailById);

// Update bank account detail (PATCH)
router.patch('/update/:id', updateBankAccountDetail);

// Delete bank account detail
router.delete('/delete/:id', deleteBankAccountDetail);

// Get all bank transactions with bank totals and final total
router.get('/transactions/totals', getAllBankTransactionsWithTotals);

// Get transactions by bank ID
router.get('/transactions/bank/:bankId', getTransactionsByBankId);

// Recalculate all bank account totals from transactions
router.post('/recalculate-totals', recalculateAllBankTotals);

// Update bank totals for a specific bank
router.post('/update-totals/:bankId', updateBankTotalsForBank);

// Auto create bank accounts for all packagemaker properties
router.get('/auto-create-from-properties', autoCreateBanksFromProperties);

// Auto create bank accounts for all cab users
router.get('/auto-create-from-cabusers', autoCreateBanksFromCabUsers);

// Get only auto-created bank accounts from cab users
router.get('/get-cabuser-banks', getAutoCreatedBankAccountsFromCabUsers);

export default router;
