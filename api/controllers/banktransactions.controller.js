import BankTransaction from '../models/banktransactions.model.js';
import BankAccountDetail from '../models/bankaccountdetail.model.js';
import Lead from '../models/lead.model.js';
import mongoose from 'mongoose';

// Function to update bank account totals based on transactions
async function updateBankAccountTotals(bankId) {
  try {
    // Get all transactions where this bank is either the primary bank or the secondary bank
    const transactions = await BankTransaction.find({
      $or: [
        { bank: bankId },
        { toBank: bankId }
      ]
    });
    
    let totalIn = 0;
    let totalOut = 0;
    
    // Calculate totals from transactions (only accepted ones)
    transactions.forEach(transaction => {
      const amount = Number(transaction.transactionAmount || 0);
      if (transaction.accept === true) {
        // Check if this is a dual bank transaction
        if (transaction.isDualBankTransaction) {
          // For dual bank transactions, check if this bank is the primary or secondary
          if (transaction.bank.toString() === bankId.toString()) {
            // This bank is the primary bank
            if (transaction.paymentType?.toLowerCase() === 'in') {
              totalIn += amount;
            } else if (transaction.paymentType?.toLowerCase() === 'out') {
              totalOut += amount;
            }
          } else if (transaction.toBank && transaction.toBank.toString() === bankId.toString()) {
            // This bank is the secondary bank
            if (transaction.toBankPaymentType?.toLowerCase() === 'in') {
              totalIn += amount;
            } else if (transaction.toBankPaymentType?.toLowerCase() === 'out') {
              totalOut += amount;
            }
          }
        } else {
          // Single bank transaction
          if (transaction.paymentType?.toLowerCase() === 'in') {
            totalIn += amount;
          } else if (transaction.paymentType?.toLowerCase() === 'out') {
            totalOut += amount;
          }
        }
      }
    });
    
    // Calculate total amount (in - out)
    const totalAmount = totalIn - totalOut;
    
    // Update bank account details
    await BankAccountDetail.findByIdAndUpdate(bankId, {
      in: totalIn,
      out: totalOut,
      totalamount: totalAmount
    });
    
    console.log(`💰 Updated bank ${bankId} totals: in=${totalIn}, out=${totalOut}, total=${totalAmount}`);
    
    return { totalIn, totalOut, totalAmount };
  } catch (error) {
    console.error('Error updating bank account totals:', error);
    throw error;
  }
}

// Locate a lead by Mongo _id (if valid) or by the custom string field `leadId`
async function findLeadByIdentifier(leadIdentifier) {
  if (!leadIdentifier) return null;
  if (mongoose.isValidObjectId(leadIdentifier)) {
    const byObjectId = await Lead.findById(leadIdentifier);
    if (byObjectId) return byObjectId;
  }
  return Lead.findOne({ leadId: String(leadIdentifier) });
}

// Calculate remaining amount based on totalAmount and accepted transactions
async function calculateRemainingAmount(leadIdentifier) {
  const lead = await findLeadByIdentifier(leadIdentifier);
  if (!lead) return null;
  
  const totalAmount = Number(lead.totalAmount || 0);
  
  // Get sum of all accepted transactions for this lead
  const acceptedTransactions = await BankTransaction.find({
    leadId: leadIdentifier,
    accept: true
  });
  
  const totalPaid = acceptedTransactions.reduce((sum, tx) => sum + Number(tx.transactionAmount || 0), 0);
  
  // Debug logging
  console.log(`🔍 Debug calculateRemainingAmount for lead ${leadIdentifier}:`);
  console.log(`   totalAmount: ${totalAmount}`);
  console.log(`   found ${acceptedTransactions.length} accepted transactions`);
  console.log(`   transaction amounts: [${acceptedTransactions.map(tx => tx.transactionAmount).join(', ')}]`);
  console.log(`   totalPaid: ${totalPaid}`);
  console.log(`   calculated remainingAmount: ${totalAmount - totalPaid}`);
  
  const remainingAmount = Math.max(0, totalAmount - totalPaid);
  return { lead, remainingAmount, totalPaid };
}

// Update lead's remainingAmount without changing totalAmount
async function updateLeadRemainingAmount(leadIdentifier, newRemainingAmount) {
  const lead = await findLeadByIdentifier(leadIdentifier);
  if (!lead) return null;
  
  lead.remainingAmount = Math.max(0, newRemainingAmount);
  await lead.save();
  return lead;
}

// Decrease remaining amount when transaction is accepted - FIXED VERSION
async function decreaseLeadRemainingAmount(leadIdentifier, amountToDecrease) {
  const amountNumber = Number(amountToDecrease);
  if (Number.isNaN(amountNumber) || amountNumber <= 0) return null;
  
  const lead = await findLeadByIdentifier(leadIdentifier);
  if (!lead) return null;
  
  // The calculateRemainingAmount already accounts for this transaction
  // So we just need to set the remainingAmount to the calculated value
  const { remainingAmount: correctRemaining } = await calculateRemainingAmount(leadIdentifier);
  
  // Debug logging
  console.log(`💰 Debug decreaseLeadRemainingAmount for lead ${leadIdentifier}:`);
  console.log(`   amountToDecrease: ${amountNumber}`);
  console.log(`   correctRemaining (final): ${correctRemaining}`);
  console.log(`   lead.totalAmount: ${lead.totalAmount}`);
  
  // Update the lead with the correct remaining amount
  // No need to deduct again since calculateRemainingAmount already did the math
  lead.remainingAmount = correctRemaining;
  await lead.save();
  return lead;
}

// Increase remaining amount when transaction acceptance is removed - FIXED VERSION
async function increaseLeadRemainingAmount(leadIdentifier, amountToIncrease) {
  const amountNumber = Number(amountToIncrease);
  if (Number.isNaN(amountNumber) || amountNumber <= 0) return null;
  
  const lead = await findLeadByIdentifier(leadIdentifier);
  if (!lead) return null;
  
  // The calculateRemainingAmount already accounts for the current state
  // So we just need to set the remainingAmount to the calculated value
  const { remainingAmount: correctRemaining } = await calculateRemainingAmount(leadIdentifier);
  
  // Debug logging
  console.log(`💰 Debug increaseLeadRemainingAmount for lead ${leadIdentifier}:`);
  console.log(`   amountToIncrease: ${amountNumber}`);
  console.log(`   correctRemaining (final): ${correctRemaining}`);
  console.log(`   lead.totalAmount: ${lead.totalAmount}`);
  
  // Update the lead with the correct remaining amount
  // No need to add again since calculateRemainingAmount already did the math
  lead.remainingAmount = correctRemaining;
  await lead.save();
  return lead;
}

// Recalculate remaining amount when totalAmount changes
async function recalculateLeadRemainingAmount(leadIdentifier) {
  const { lead, remainingAmount } = await calculateRemainingAmount(leadIdentifier);
  if (!lead) return null;
  
  lead.remainingAmount = remainingAmount;
  await lead.save();
  return lead;
}

// Initialize remainingAmount for a new lead (should be called when lead is created)
async function initializeLeadRemainingAmount(leadIdentifier) {
  const lead = await findLeadByIdentifier(leadIdentifier);
  if (!lead) return null;
  
  // If remainingAmount is not set, calculate it
  if (lead.remainingAmount === undefined || lead.remainingAmount === null) {
    const { remainingAmount } = await calculateRemainingAmount(leadIdentifier);
    lead.remainingAmount = remainingAmount;
    await lead.save();
    return lead;
  }
  
  return lead;
}

// Get current remaining amount for a lead
async function getLeadRemainingAmount(leadIdentifier) {
  const { remainingAmount, totalPaid } = await calculateRemainingAmount(leadIdentifier);
  return { remainingAmount, totalPaid };
}

// Debug function to fix remaining amount for a lead
async function fixLeadRemainingAmount(leadIdentifier) {
  const lead = await findLeadByIdentifier(leadIdentifier);
  if (!lead) return null;
  
  const totalAmount = Number(lead.totalAmount || 0);
  
  // Get sum of all accepted transactions for this lead
  const acceptedTransactions = await BankTransaction.find({
    leadId: leadIdentifier,
    accept: true
  });
  
  const totalPaid = acceptedTransactions.reduce((sum, tx) => sum + Number(tx.transactionAmount || 0), 0);
  const correctRemainingAmount = Math.max(0, totalAmount - totalPaid);
  
  // Update the lead with correct remaining amount
  lead.remainingAmount = correctRemainingAmount;
  await lead.save();
  
  return {
    lead,
    totalAmount,
    totalPaid,
    correctRemainingAmount,
    previousRemainingAmount: lead.remainingAmount
  };
}

// Debug function to get detailed lead information
async function debugLeadAmounts(leadIdentifier) {
  const lead = await findLeadByIdentifier(leadIdentifier);
  if (!lead) return null;
  
  const totalAmount = Number(lead.totalAmount || 0);
  const currentRemainingAmount = Number(lead.remainingAmount || 0);
  
  // Get all transactions for this lead
  const allTransactions = await BankTransaction.find({ leadId: leadIdentifier });
  const acceptedTransactions = allTransactions.filter(tx => tx.accept === true);
  const pendingTransactions = allTransactions.filter(tx => tx.accept !== true);
  
  const totalPaid = acceptedTransactions.reduce((sum, tx) => sum + Number(tx.transactionAmount || 0), 0);
  const expectedRemaining = Math.max(0, totalAmount - totalPaid);
  
  return {
    leadId: leadIdentifier,
    totalAmount,
    currentRemainingAmount,
    expectedRemainingAmount: expectedRemaining,
    totalPaid,
    transactionCount: allTransactions.length,
    acceptedTransactions: acceptedTransactions.map(tx => ({
      id: tx._id,
      amount: tx.transactionAmount,
      accept: tx.accept,
      createdAt: tx.createdAt
    })),
    pendingTransactions: pendingTransactions.map(tx => ({
      id: tx._id,
      amount: tx.transactionAmount,
      accept: tx.accept,
      createdAt: tx.createdAt
    })),
    discrepancy: currentRemainingAmount - expectedRemaining
  };
}

export const createTransaction = async (req, res, next) => {
  try {
    const {
      bank,
      bankId,
      toBank,
      toBankId,
      isDualBankTransaction,
      leadId,
      leadName,  
      travelDate,
      duration,
      destination,   
operationId,
      paymentMode,
      paymentType,
      toBankPaymentType,
      transactionAmount,
      transactionId,
      utrNumber,
      image,
      transactionDate,
      clearDate,
      description,
      toAccount,
      totalHotelamount,
      totalCabamount,
      automatichoteltransaction,
      automaticcabtransaction,
      hotelPayment,    // ADD THIS
  cabPayment, 
      accept,
    } = req.body;

    const resolvedBankId = bank?.id || bank?._id || bank || bankId;
    const resolvedToBankId = toBank?.id || toBank?._id || toBank || toBankId;
    
    // Check if this is a dual bank transaction
    const isDual = isDualBankTransaction === true || isDualBankTransaction === 'true';
    
    // Bank is optional during creation (for sales/operations team)
    // It will be added later by accounts team
    let foundBank = null;
    let foundToBank = null;
    
    // Only validate and fetch bank if provided
    if (resolvedBankId) {
      foundBank = await BankAccountDetail.findById(resolvedBankId);
      if (!foundBank) {
        return res.status(404).json({ success: false, message: 'Primary bank account not found' });
      }
      
      if (isDual && !resolvedToBankId) {
        return res.status(400).json({ success: false, message: 'toBank id is required for dual bank transactions' });
      }

      if (isDual && resolvedToBankId) {
        foundToBank = await BankAccountDetail.findById(resolvedToBankId);
        if (!foundToBank) {
          return res.status(404).json({ success: false, message: 'Secondary bank account not found' });
        }
      }
    }

    const amountNumber = Number(transactionAmount);
    if (Number.isNaN(amountNumber)) {
      return res.status(400).json({ success: false, message: 'transactionAmount must be a number' });
    }

    const normalizedPaymentType = paymentType ? String(paymentType).toLowerCase() : undefined;
    const normalizedToBankPaymentType = toBankPaymentType ? String(toBankPaymentType).toLowerCase() : undefined;
    
    // Fetch lead amounts if leadId is provided
    let leadTotalAmount = undefined;
    let leadRemainingAmount = undefined;
    
    if (leadId) {
      try {
        const lead = await findLeadByIdentifier(leadId);
        if (lead) {
          leadTotalAmount = Number(lead.totalAmount || 0);
          leadRemainingAmount = Number(lead.remainingAmount || 0);
        }
      } catch (error) {
        console.error("Error fetching lead amounts:", error);
      }
    }

    const tx = new BankTransaction({
      bank: resolvedBankId || undefined,
      bankName: bank?.bankName ?? (foundBank ? foundBank.bankName : undefined),
      accountNumber: bank?.accountNumber ?? (foundBank ? foundBank.accountNumber : undefined),
      toBank: isDual ? resolvedToBankId : undefined,
      toBankName: isDual ? (toBank?.bankName ?? (foundToBank ? foundToBank.bankName : undefined)) : undefined,
      toAccountNumber: isDual ? (toBank?.accountNumber ?? (foundToBank ? foundToBank.accountNumber : undefined)) : undefined,
      isDualBankTransaction: isDual,
      leadId,
      leadName,
      travelDate,
      duration,
      destination,
      operationId,
      toAccount,
      paymentMode,
      paymentType: normalizedPaymentType,
      toBankPaymentType: isDual ? normalizedToBankPaymentType : undefined,
      transactionAmount: amountNumber,
      transactionId,
      utrNumber,
      image,
      transactionDate: transactionDate ? new Date(transactionDate) : undefined,
      clearDate: clearDate ? new Date(clearDate) : undefined,
      description,
      totalHotelamount,
      totalCabamount,
      automatichoteltransaction,
      automaticcabtransaction,
      hotelPayment,
      cabPayment,
      accept: accept === true || accept === 'true' ? true : accept === false || accept === 'false' ? false : undefined,
      leadTotalAmount,
      leadRemainingAmount,
    });

    const saved = await tx.save();

    // If accepted at creation time, ensure remainingAmount is initialized and then decrease it
    try {
      if ((saved.accept === true) && leadId) {
        // First ensure remainingAmount is properly initialized
        await initializeLeadRemainingAmount(leadId);
        // Then decrease it
        await decreaseLeadRemainingAmount(leadId, amountNumber);
      }
    } catch (error) {
      console.error("Error processing lead amount adjustment:", error);
    }

    // Update bank account totals after creating a transaction
    // Only update if bank is provided
    try {
      if (resolvedBankId) {
        await updateBankAccountTotals(resolvedBankId);
      }
      if (isDual && resolvedToBankId) {
        await updateBankAccountTotals(resolvedToBankId);
      }
    } catch (error) {
      console.error("Error updating bank account totals after creation:", error);
    }

    return res.status(201).json({ success: true, data: saved });
  } catch (error) {
    next(error);
  }
};

export const getTransactions = async (req, res, next) => {
  try {
    const { bank, bankId, paymentMode } = req.query;
    const filter = { accept: true };
    const resolvedBankId = bank || bankId;
    if (resolvedBankId) {
      // Include transactions where this bank is either primary or secondary
      filter.$or = [
        { bank: resolvedBankId },
        { toBank: resolvedBankId }
      ];
    }
    if (paymentMode) filter.paymentMode = paymentMode;

    const transactions = await BankTransaction.find(filter)
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');

    // Calculate running totals for totalamount while keeping individual amounts for in/out
    const sortedTransactions = transactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    // Track running totals for each bank
    const bankRunningTotals = {};
    
    // Initialize running totals for all banks
    const allBanks = new Set();
    sortedTransactions.forEach(tx => {
      if (tx.bank && tx.bank._id) allBanks.add(tx.bank._id.toString());
      if (tx.toBank && tx.toBank._id) allBanks.add(tx.toBank._id.toString());
    });
    
    allBanks.forEach(bankId => {
      bankRunningTotals[bankId] = { in: 0, out: 0, totalamount: 0 };
    });
    
    // Process transactions chronologically and store running totals AFTER each transaction
    const transactionsWithMixedAmounts = [];
    
    sortedTransactions.forEach(transaction => {
      const amount = Number(transaction.transactionAmount || 0);
      
      // Update running totals if transaction is accepted
      if (transaction.accept === true) {
        if (transaction.isDualBankTransaction) {
          // Handle primary bank
          if (transaction.bank && transaction.bank._id) {
            const primaryBankId = transaction.bank._id.toString();
            if (transaction.paymentType?.toLowerCase() === 'in') {
              bankRunningTotals[primaryBankId].in += amount;
            } else if (transaction.paymentType?.toLowerCase() === 'out') {
              bankRunningTotals[primaryBankId].out += amount;
            }
            bankRunningTotals[primaryBankId].totalamount = bankRunningTotals[primaryBankId].in - bankRunningTotals[primaryBankId].out;
          }
          
          // Handle secondary bank
          if (transaction.toBank && transaction.toBank._id) {
            const secondaryBankId = transaction.toBank._id.toString();
            if (transaction.toBankPaymentType?.toLowerCase() === 'in') {
              bankRunningTotals[secondaryBankId].in += amount;
            } else if (transaction.toBankPaymentType?.toLowerCase() === 'out') {
              bankRunningTotals[secondaryBankId].out += amount;
            }
            bankRunningTotals[secondaryBankId].totalamount = bankRunningTotals[secondaryBankId].in - bankRunningTotals[secondaryBankId].out;
          }
        } else {
          // Single bank transaction
          if (transaction.bank && transaction.bank._id) {
            const bankId = transaction.bank._id.toString();
            if (transaction.paymentType?.toLowerCase() === 'in') {
              bankRunningTotals[bankId].in += amount;
            } else if (transaction.paymentType?.toLowerCase() === 'out') {
              bankRunningTotals[bankId].out += amount;
            }
            bankRunningTotals[bankId].totalamount = bankRunningTotals[bankId].in - bankRunningTotals[bankId].out;
          }
        }
      }
      
      // Create modified transaction with individual amounts for in/out and running totals for totalamount
      const modifiedTransaction = { ...transaction.toObject() };
      
      if (transaction.isDualBankTransaction) {
        if (transaction.bank && transaction.bank._id) {
          const primaryBankId = transaction.bank._id.toString();
          const secondaryBankId = transaction.toBank?._id?.toString();
          
          modifiedTransaction.bank = {
            ...transaction.bank.toObject(),
            in: transaction.paymentType?.toLowerCase() === 'in' ? amount : 0,  // Individual amount
            out: transaction.paymentType?.toLowerCase() === 'out' ? amount : 0,  // Individual amount
            totalamount: bankRunningTotals[primaryBankId]?.totalamount || 0  // Running total
          };
          
          if (secondaryBankId && transaction.toBank) {
            modifiedTransaction.toBank = {
              ...transaction.toBank.toObject(),
              in: transaction.toBankPaymentType?.toLowerCase() === 'in' ? amount : 0,  // Individual amount
              out: transaction.toBankPaymentType?.toLowerCase() === 'out' ? amount : 0,  // Individual amount
              totalamount: bankRunningTotals[secondaryBankId]?.totalamount || 0  // Running total
            };
          }
        }
      } else {
        if (transaction.bank && transaction.bank._id) {
          const bankId = transaction.bank._id.toString();
          modifiedTransaction.bank = {
            ...transaction.bank.toObject(),
            in: transaction.paymentType?.toLowerCase() === 'in' ? amount : 0,  // Individual amount
            out: transaction.paymentType?.toLowerCase() === 'out' ? amount : 0,  // Individual amount
            totalamount: bankRunningTotals[bankId]?.totalamount || 0  // Running total
          };
        }
      }
      
      transactionsWithMixedAmounts.push(modifiedTransaction);
    });
    
    // Sort back to newest first for display
    const finalTransactions = transactionsWithMixedAmounts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ success: true, data: finalTransactions });
  } catch (error) {
    next(error);
  }
};

export const getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tx = await BankTransaction.findById(id).populate('bank').populate('toBank');
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    return res.status(200).json({ success: true, data: tx });
  } catch (error) {
    next(error);
  }
};

export const getTransactionsByLeadId = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const transactions = await BankTransaction.find({ leadId })
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');
    return res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    next(error);
  }
};

// Get pending transactions (for account team review)
// These are transactions without bank details or not accepted yet
// Excludes automatic hotel and cab transactions
export const getPendingTransactions = async (req, res, next) => {
  try {
    // Find transactions where:
    // 1. Bank is not set (created by sales/operations) OR
    // 2. Accept is not true (pending approval)
    // 3. Exclude automatic hotel and cab transactions
    const transactions = await BankTransaction.find({
      $and: [
        {
          $or: [
            { bank: { $exists: false } },
            { bank: null },
            { accept: { $ne: true } }
          ]
        },
        { automatichoteltransaction: { $ne: true } },
        { automaticcabtransaction: { $ne: true } }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');
    
    return res.status(200).json({ 
      success: true, 
      data: transactions,
      count: transactions.length 
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionByOperationId = async (req, res, next) => {
  try {
    const { operationId } = req.params;
    const transactions = await BankTransaction.find({ operationId })
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');
    
    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ success: false, message: 'No transactions found' });
    }
    
    return res.status(200).json({ success: true, data: transactions, count: transactions.length });
  } catch (error) {
    next(error);
  }
};


// Get pending operation by operationId
export const getPendingOperationByOperationId = async (req, res, next) => {
  try {
    const { operationId } = req.params;
    
    // Find transaction by operationId where it's pending
    const transaction = await BankTransaction.findOne({
      operationId,
      $or: [
        { bank: { $exists: false } },
        { bank: null },
        { accept: { $ne: true } }
      ]
    })
      .populate('bank')
      .populate('toBank');
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Pending transaction not found with this operationId' 
      });
    }
    
    return res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
};

export const updateTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      bank,
      bankId,
      toBank,
      toBankId,
      isDualBankTransaction,
      leadId,
      leadName,
      travelDate,
      duration,
      destination,
      operationId,
      paymentMode,
      paymentType,
      toBankPaymentType,
      transactionAmount,
      transactionId,
      utrNumber,
      image,
      transactionDate,
      clearDate,
      description,
      toAccount,
      totalHotelamount,
      totalCabamount,
      automatichoteltransaction,
      automaticcabtransaction,
      hotelPayment,
      cabPayment,
      accept,
    } = req.body;

    const tx = await BankTransaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Snapshot previous state for lead adjustments and bank updates
    const previousAccept = tx.accept === true;
    const previousAmount = Number(tx.transactionAmount || 0);
    const previousLeadId = tx.leadId;
    const previousIsDual = tx.isDualBankTransaction;
    const previousBank = tx.bank;
    const previousToBank = tx.toBank;

    const resolvedBankId = bank?.id || bank?._id || bank || bankId;
    const resolvedToBankId = toBank?.id || toBank?._id || toBank || toBankId;
    const isDual = isDualBankTransaction === true || isDualBankTransaction === 'true';

    let foundBank = null;
    let foundToBank = null;
    
    // Handle bank assignment (for accounts team adding bank details)
    if (resolvedBankId) {
      foundBank = await BankAccountDetail.findById(resolvedBankId);
      if (!foundBank) {
        return res.status(404).json({ success: false, message: 'Primary bank account not found' });
      }
      tx.bank = resolvedBankId;
      if (bank?.bankName || foundBank?.bankName) tx.bankName = bank?.bankName ?? foundBank.bankName;
      if (bank?.accountNumber || foundBank?.accountNumber) tx.accountNumber = bank?.accountNumber ?? foundBank.accountNumber;
    }

    if (isDual && resolvedToBankId) {
      foundToBank = await BankAccountDetail.findById(resolvedToBankId);
      if (!foundToBank) {
        return res.status(404).json({ success: false, message: 'Secondary bank account not found' });
      }
      tx.toBank = resolvedToBankId;
      if (toBank?.bankName || foundToBank?.bankName) tx.toBankName = toBank?.bankName ?? foundToBank.bankName;
      if (toBank?.accountNumber || foundToBank?.accountNumber) tx.toAccountNumber = toBank?.accountNumber ?? foundToBank.accountNumber;
    }

    if (paymentMode !== undefined) tx.paymentMode = paymentMode;
    if (isDualBankTransaction !== undefined) tx.isDualBankTransaction = isDual;
    
    if (isDual) {
      // For dual bank transactions, set both payment types
      if (paymentType !== undefined) {
        tx.paymentType = String(paymentType).toLowerCase();
      }
      if (toBankPaymentType !== undefined) {
        tx.toBankPaymentType = String(toBankPaymentType).toLowerCase();
      }
    } else {
      // For single bank transactions, use paymentType
      if (paymentType !== undefined) {
        tx.paymentType = String(paymentType).toLowerCase();
      }
      // Clear dual bank fields
      tx.toBank = undefined;
      tx.toBankName = undefined;
      tx.toAccountNumber = undefined;
      tx.toBankPaymentType = undefined;
    }
    
    if (transactionAmount !== undefined) {
      const amountNumber = Number(transactionAmount);
      if (Number.isNaN(amountNumber)) {
        return res.status(400).json({ success: false, message: 'transactionAmount must be a number' });
      }
      
      const currentPaymentType = tx.paymentType?.toLowerCase();
      const currentToBankPaymentType = tx.toBankPaymentType?.toLowerCase();
      
      tx.transactionAmount = amountNumber;
    }
    if (transactionId !== undefined) tx.transactionId = transactionId;
    if (utrNumber !== undefined) tx.utrNumber = utrNumber;
    if (image !== undefined) tx.image = image;
    if (transactionDate !== undefined) tx.transactionDate = transactionDate ? new Date(transactionDate) : undefined;
    if (clearDate !== undefined) tx.clearDate = clearDate ? new Date(clearDate) : undefined;
    if (description !== undefined) tx.description = description;
    if (toAccount !== undefined) tx.toAccount = toAccount;
    if (operationId !== undefined) tx.operationId = operationId;
    if (totalHotelamount !== undefined) tx.totalHotelamount = totalHotelamount;
    if (totalCabamount !== undefined) tx.totalCabamount = totalCabamount;
    if (automatichoteltransaction !== undefined) tx.automatichoteltransaction = automatichoteltransaction;
    if (automaticcabtransaction !== undefined) tx.automaticcabtransaction = automaticcabtransaction;
    if (accept !== undefined) tx.accept = accept;
    if (leadId !== undefined) tx.leadId = leadId;
    if (leadName !== undefined) tx.leadName = leadName;
    if (hotelPayment !== undefined) tx.hotelPayment = hotelPayment;
    if (cabPayment !== undefined) tx.cabPayment = cabPayment;
    if (travelDate !== undefined) tx.travelDate = travelDate;
    if (duration !== undefined) tx.duration = duration;
    if (destination !== undefined) tx.destination = destination;
    // Fetch and update lead amounts if leadId is provided
    if (leadId !== undefined) {
      try {
        const lead = await findLeadByIdentifier(leadId);
        if (lead) {
          tx.leadTotalAmount = Number(lead.totalAmount || 0);
          tx.leadRemainingAmount = Number(lead.remainingAmount || 0);
        }
      } catch (error) {
        console.error("Error fetching lead amounts during update:", error);
      }
    }
    
    const updated = await tx.save();

    // Lead adjustments after save based on previous vs current state
    try {
      const currentAccept = updated.accept === true;
      const currentAmount = Number(updated.transactionAmount || 0);
      const currentLeadId = updated.leadId;

      if (!previousAccept && currentAccept && currentLeadId) {
        // Newly accepted
        await decreaseLeadRemainingAmount(currentLeadId, currentAmount);
      } else if (previousAccept && !currentAccept && previousLeadId) {
        // Acceptance removed, revert previous reduction
        await increaseLeadRemainingAmount(previousLeadId, previousAmount);
      } else if (previousAccept && currentAccept) {
        // Still accepted; handle amount or lead changes
        if (previousLeadId && currentLeadId && previousLeadId !== currentLeadId) {
          // Move acceptance from one lead to another
          await increaseLeadRemainingAmount(previousLeadId, previousAmount);
          await decreaseLeadRemainingAmount(currentLeadId, currentAmount);
        } else if (currentLeadId) {
          const delta = currentAmount - previousAmount;
          if (delta > 0) {
            await decreaseLeadRemainingAmount(currentLeadId, delta);
          } else if (delta < 0) {
            await increaseLeadRemainingAmount(currentLeadId, Math.abs(delta));
          }
        }
      }
    } catch (error) {
      console.error("Error adjusting lead amounts:", error);
    }
    
    // Update bank account totals after updating a transaction
    try {
      // Update primary bank (if assigned)
      if (updated.bank) {
        await updateBankAccountTotals(updated.bank);
      }
      
      // If bank was changed, update the old bank too
      if (previousBank && previousBank.toString() !== updated.bank?.toString()) {
        await updateBankAccountTotals(previousBank);
      }
      
      // Update secondary bank if it's a dual transaction or was previously dual
      if (updated.isDualBankTransaction && updated.toBank) {
        await updateBankAccountTotals(updated.toBank);
      } else if (previousIsDual && previousToBank) {
        // If it was previously dual but now single, update the old secondary bank
        await updateBankAccountTotals(previousToBank);
      }
    } catch (error) {
      console.error("Error updating bank account totals after update:", error);
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};
export const getDualBankTransactions = async (req, res, next) => {
  try {
    const { accept, paymentMode } = req.query;
    const filter = { isDualBankTransaction: true };
    
    if (accept !== undefined) filter.accept = accept === 'true' || accept === true;
    if (paymentMode) filter.paymentMode = paymentMode;

    // Get all dual bank transactions first
    const allTransactions = await BankTransaction.find(filter)
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');
    
    // Filter to only include transactions where banks are property-based (accountNumber starts with "ACC-")
    const propertyTransactions = allTransactions.filter(transaction => {
      const primaryBankIsProperty = transaction.bank?.accountNumber?.startsWith('ACC-');
      const secondaryBankIsProperty = transaction.toBank?.accountNumber?.startsWith('ACC-');
      
      // At least one bank should be property-based
      return primaryBankIsProperty || secondaryBankIsProperty;
    });
    
    return res.status(200).json({ success: true, data: propertyTransactions });
  } catch (error) {
    next(error);
  }
};

// Get transactions where cab users are used as banks (either primary or secondary)
export const getCabUserBankTransactions = async (req, res, next) => {
  try {
    const { accept, paymentMode } = req.query;
    const filter = {};
    
    if (accept !== undefined) filter.accept = accept === 'true' || accept === true;
    if (paymentMode) filter.paymentMode = paymentMode;

    // Get all transactions first
    const allTransactions = await BankTransaction.find(filter)
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');
    
    // Filter to only include transactions where banks are cab user-based (accountNumber starts with "CAB-")
    const cabUserTransactions = allTransactions.filter(transaction => {
      const primaryBankIsCabUser = transaction.bank?.accountNumber?.startsWith('CAB-');
      const secondaryBankIsCabUser = transaction.toBank?.accountNumber?.startsWith('CAB-');
      
      // At least one bank should be cab user-based
      return primaryBankIsCabUser || secondaryBankIsCabUser;
    });
    
    return res.status(200).json({ success: true, data: cabUserTransactions });
  } catch (error) {
    next(error);
  }
};

// Get automatic hotel transactions
export const getAutomaticHotelTransactions = async (req, res, next) => {
  try {
    const { accept, paymentMode } = req.query;
    const filter = { automatichoteltransaction: true };
    
    if (accept !== undefined) filter.accept = accept === 'true' || accept === true;
    if (paymentMode) filter.paymentMode = paymentMode;

    const transactions = await BankTransaction.find(filter)
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');
    
    return res.status(200).json({ success: true, data: transactions, count: transactions.length });
  } catch (error) {
    next(error);
  }
};

// Get automatic cab transactions
export const getAutomaticCabTransactions = async (req, res, next) => {
  try {
    const { accept, paymentMode } = req.query;
    const filter = { automaticcabtransaction: true };
    
    if (accept !== undefined) filter.accept = accept === 'true' || accept === true;
    if (paymentMode) filter.paymentMode = paymentMode;

    const transactions = await BankTransaction.find(filter)
      .sort({ createdAt: -1 })
      .populate('bank')
      .populate('toBank');
    
    return res.status(200).json({ success: true, data: transactions, count: transactions.length });
  } catch (error) {
    next(error);
  }
};
export const deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tx = await BankTransaction.findById(id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const wasAccepted = tx.accept === true;
    const txAmount = Number(tx.transactionAmount || 0);
    const txLeadId = tx.leadId;
    const wasDual = tx.isDualBankTransaction;
    const toBankId = tx.toBank;

    const deleted = await BankTransaction.findByIdAndDelete(id);

    // If an accepted transaction is deleted, restore the amount to the lead's remainingAmount
    try {
      if (deleted && wasAccepted && txLeadId && txAmount > 0) {
        await increaseLeadRemainingAmount(txLeadId, txAmount);
      }
    } catch (error) {
      console.error("Error restoring lead amount after deletion:", error);
    }

    // Update bank account totals after deleting a transaction
    try {
      await updateBankAccountTotals(tx.bank);
      if (wasDual && toBankId) {
        await updateBankAccountTotals(toBankId);
      }
    } catch (error) {
      console.error("Error updating bank account totals after deletion:", error);
    }

    return res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    next(error);
  }
};

// Export the recalculation function for use in lead controller
export { recalculateLeadRemainingAmount, initializeLeadRemainingAmount, getLeadRemainingAmount, fixLeadRemainingAmount, debugLeadAmounts };



