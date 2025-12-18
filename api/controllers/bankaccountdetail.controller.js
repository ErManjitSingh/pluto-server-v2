import BankAccountDetail from '../models/bankaccountdetail.model.js';
import BankTransaction from '../models/banktransactions.model.js';
import Property from '../models/packagemaker.model.js';
import CabUser from '../models/cabuser.model.js';

// Create new bank account detail
export const createBankAccountDetail = async (req, res, next) => {
  try {
    const { bankName, accountNumber, in: inAmount, out, totalamount } = req.body;
    
    const newBankAccountDetail = new BankAccountDetail({
      bankName,
      accountNumber,
      in: inAmount,
      out,
      totalamount
    });

    const savedBankAccountDetail = await newBankAccountDetail.save();
    
    res.status(201).json({
      success: true,
      message: 'Bank account detail created successfully',
      data: savedBankAccountDetail
    });
  } catch (error) {
    next(error);
  }
};

// Get all bank account details
export const getAllBankAccountDetails = async (req, res, next) => {
  try {
    const bankAccountDetails = await BankAccountDetail.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      message: 'Bank account details retrieved successfully',
      data: bankAccountDetails
    });
  } catch (error) {
    next(error);
  }
};

// Get only manually created bank accounts
export const getManualBankAccounts = async (req, res, next) => {
  try {
    // Find banks that are NOT created from properties (manual banks)
    // These are banks where accountNumber doesn't start with "ACC-"
const manualBanks = await BankAccountDetail.find({
      accountNumber: { 
        $not: { 
          $regex: /^(ACC-|CAB-)/ 
        } 
      }
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      message: 'Manual bank accounts retrieved successfully',
      data: manualBanks
    });
  } catch (error) {
    next(error);
  }
};

// Get only auto-created bank accounts from properties
export const getAutoCreatedBankAccounts = async (req, res, next) => {
  try {
    // Find banks that are created from properties (auto banks)
    // These are banks where accountNumber starts with "ACC-"
    const autoBanks = await BankAccountDetail.find({
      accountNumber: { $regex: /^ACC-/ }
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      message: 'Auto-created bank accounts retrieved successfully',
      data: autoBanks
    });
  } catch (error) {
    next(error);
  }
};

// Get bank account detail by ID
export const getBankAccountDetailById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const bankAccountDetail = await BankAccountDetail.findById(id);
    
    if (!bankAccountDetail) {
      return res.status(404).json({
        success: false,
        message: 'Bank account detail not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Bank account detail retrieved successfully',
      data: bankAccountDetail
    });
  } catch (error) {
    next(error);
  }
};

// Update bank account detail (PATCH)
export const updateBankAccountDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { bankName, accountNumber, in: inAmount, out, totalamount } = req.body;
    
    const bankAccountDetail = await BankAccountDetail.findById(id);
    
    if (!bankAccountDetail) {
      return res.status(404).json({
        success: false,
        message: 'Bank account detail not found'
      });
    }
    
    // Update only the fields that are provided
    if (bankName !== undefined) bankAccountDetail.bankName = bankName;
    if (accountNumber !== undefined) bankAccountDetail.accountNumber = accountNumber;
    if (inAmount !== undefined) bankAccountDetail.in = inAmount;
    if (out !== undefined) bankAccountDetail.out = out;
    if (totalamount !== undefined) bankAccountDetail.totalamount = totalamount;
    
    const updatedBankAccountDetail = await bankAccountDetail.save();
    
    res.status(200).json({
      success: true,
      message: 'Bank account detail updated successfully',
      data: updatedBankAccountDetail
    });
  } catch (error) {
    next(error);
  }
};

// Delete bank account detail
export const deleteBankAccountDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const bankAccountDetail = await BankAccountDetail.findByIdAndDelete(id);
    
    if (!bankAccountDetail) {
      return res.status(404).json({
        success: false,
        message: 'Bank account detail not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Bank account detail deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get all bank transactions with bank totals and final total 
export const getAllBankTransactionsWithTotals = async (req, res, next) => {
  try {
    // Get all bank account details
    const bankAccounts = await BankAccountDetail.find().sort({ createdAt: -1 });
    
    // Get all transactions
    const allTransactions = await BankTransaction.find().sort({ createdAt: -1 }).populate('bank').populate('toBank');
    
    // Calculate totals for each bank
    const bankTotals = {};
    
    // Initialize totals for each bank
    bankAccounts.forEach(bank => {
      bankTotals[bank._id.toString()] = {
        in: 0,
        out: 0,
        totalamount: 0
      };
    });
    
                    // Calculate running totals from transactions chronologically (oldest first)
        const sortedTransactions = allTransactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        // Track running totals for each bank
        const runningTotals = {};
        bankAccounts.forEach(bank => {
          runningTotals[bank._id.toString()] = {
            in: 0,
            out: 0,
            totalamount: 0
          };
        });
        
        // Process transactions chronologically to build running totals
        sortedTransactions.forEach(transaction => {
          const amount = Number(transaction.transactionAmount || 0);
          
          // Only count accepted transactions and update running totals
          if (transaction.accept === true) {
            // Check if this is a dual bank transaction
            if (transaction.isDualBankTransaction) {
              // Handle primary bank
              const primaryBankId = transaction.bank._id.toString();
              if (transaction.paymentType?.toLowerCase() === 'in') {
                runningTotals[primaryBankId].in += amount;
              } else if (transaction.paymentType?.toLowerCase() === 'out') {
                runningTotals[primaryBankId].out += amount;
              }
              runningTotals[primaryBankId].totalamount = runningTotals[primaryBankId].in - runningTotals[primaryBankId].out;
              
              // Handle secondary bank
              if (transaction.toBank) {
                const secondaryBankId = transaction.toBank._id.toString();
                if (transaction.toBankPaymentType?.toLowerCase() === 'in') {
                  runningTotals[secondaryBankId].in += amount;
                } else if (transaction.toBankPaymentType?.toLowerCase() === 'out') {
                  runningTotals[secondaryBankId].out += amount;
                }
                runningTotals[secondaryBankId].totalamount = runningTotals[secondaryBankId].in - runningTotals[secondaryBankId].out;
              }
            } else {
              // Single bank transaction
              const bankId = transaction.bank._id.toString();
              if (transaction.paymentType?.toLowerCase() === 'in') {
                runningTotals[bankId].in += amount;
              } else if (transaction.paymentType?.toLowerCase() === 'out') {
                runningTotals[bankId].out += amount;
              }
              runningTotals[bankId].totalamount = runningTotals[bankId].in - runningTotals[bankId].out;
            }
          }
          
          // Store the running totals AFTER processing this transaction
          // For dual bank transactions, we'll show totals for both banks
          if (transaction.isDualBankTransaction) {
            const primaryBankId = transaction.bank._id.toString();
            const secondaryBankId = transaction.toBank?._id?.toString();
            
            transaction.runningTotalsAtTransaction = {
              primaryBank: {
                in: transaction.paymentType?.toLowerCase() === 'in' ? amount : 0,
                out: transaction.paymentType?.toLowerCase() === 'out' ? amount : 0,
                totalamount: runningTotals[primaryBankId]?.totalamount || 0
              },
              secondaryBank: secondaryBankId ? {
                in: transaction.toBankPaymentType?.toLowerCase() === 'in' ? amount : 0,
                out: transaction.toBankPaymentType?.toLowerCase() === 'out' ? amount : 0,
                totalamount: runningTotals[secondaryBankId]?.totalamount || 0
              } : null
            };
          } else {
            // Single bank transaction
            const bankId = transaction.bank._id.toString();
            transaction.runningTotalsAtTransaction = {
              in: transaction.paymentType?.toLowerCase() === 'in' ? amount : 0,
              out: transaction.paymentType?.toLowerCase() === 'out' ? amount : 0,
              totalamount: runningTotals[bankId]?.totalamount || 0
            };
          }
        });
        
        // Create response with transactions and their running totals at transaction time
        const response = {
          success: true,
          message: 'Bank transactions with running totals retrieved successfully',
          data: {
            transactions: allTransactions.map(transaction => ({
              ...transaction.toObject(),
              bankTotalsAtTransaction: transaction.runningTotalsAtTransaction
            })),
            finalBankTotals: runningTotals,
            finalTotalAmount: Object.values(runningTotals).reduce((sum, bank) => sum + bank.totalamount, 0)
          }
        };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// Get transactions by bank ID
export const getTransactionsByBankId = async (req, res, next) => {
  try {
    const { bankId } = req.params;
    
    // Verify bank exists
    const bank = await BankAccountDetail.findById(bankId);
    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found'
      });
    }
    
    // Get all transactions for this bank, sorted chronologically (oldest first)
    const transactions = await BankTransaction.find({
      $or: [
        { bank: bankId },
        { toBank: bankId }
      ]
    }).sort({ createdAt: 1 }).populate('bank').populate('toBank');
    
    // Calculate running totals for this specific bank chronologically
    let runningIn = 0;
    let runningOut = 0;
    let runningTotal = 0;
    
    const transactionsWithRunningTotals = transactions.map(transaction => {
      const amount = Number(transaction.transactionAmount || 0);
      
      // Only count accepted transactions and update running totals
      if (transaction.accept === true) {
        // Check if this is a dual bank transaction
        if (transaction.isDualBankTransaction) {
          // Check if this bank is the primary or secondary bank
          if (transaction.bank._id.toString() === bankId.toString()) {
            // This bank is the primary bank
            if (transaction.paymentType?.toLowerCase() === 'in') {
              runningIn += amount;
            } else if (transaction.paymentType?.toLowerCase() === 'out') {
              runningOut += amount;
            }
          } else if (transaction.toBank && transaction.toBank._id.toString() === bankId.toString()) {
            // This bank is the secondary bank
            if (transaction.toBankPaymentType?.toLowerCase() === 'in') {
              runningIn += amount;
            } else if (transaction.toBankPaymentType?.toLowerCase() === 'out') {
              runningOut += amount;
            }
          }
        } else {
          // Single bank transaction
          if (transaction.paymentType?.toLowerCase() === 'in') {
            runningIn += amount;
          } else if (transaction.paymentType?.toLowerCase() === 'out') {
            runningOut += amount;
          }
        }
        runningTotal = runningIn - runningOut;
      }
      
      // Store the running totals AFTER processing this transaction
      let runningTotalsAtTransaction;
      
      if (transaction.isDualBankTransaction) {
        // For dual bank transactions, show the amount for this specific bank
        if (transaction.bank._id.toString() === bankId.toString()) {
          // This bank is the primary bank
          runningTotalsAtTransaction = {
            in: transaction.paymentType?.toLowerCase() === 'in' ? amount : 0,
            out: transaction.paymentType?.toLowerCase() === 'out' ? amount : 0,
            totalamount: runningTotal
          };
        } else if (transaction.toBank && transaction.toBank._id.toString() === bankId.toString()) {
          // This bank is the secondary bank
          runningTotalsAtTransaction = {
            in: transaction.toBankPaymentType?.toLowerCase() === 'in' ? amount : 0,
            out: transaction.toBankPaymentType?.toLowerCase() === 'out' ? amount : 0,
            totalamount: runningTotal
          };
        }
      } else {
        // Single bank transaction
        runningTotalsAtTransaction = {
          in: transaction.paymentType?.toLowerCase() === 'in' ? amount : 0,
          out: transaction.paymentType?.toLowerCase() === 'out' ? amount : 0,
          totalamount: runningTotal
        };
      }
      
      return {
        ...transaction.toObject(),
        runningTotals: runningTotalsAtTransaction
      };
    });
    
    res.status(200).json({
      success: true,
      message: 'Transactions by bank ID retrieved successfully',
      data: {
        bank: bank,
        transactions: transactionsWithRunningTotals,
        finalTotals: {
          in: runningIn,
          out: runningOut,
          totalamount: runningTotal
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Recalculate all bank account totals from transactions (useful for fixing data)
export const recalculateAllBankTotals = async (req, res, next) => {
  try {
    // Get all bank accounts
    const bankAccounts = await BankAccountDetail.find();
    
    const results = [];
    
    for (const bankAccount of bankAccounts) {
      try {
        // Get all transactions for this bank (both primary and secondary)
        const transactions = await BankTransaction.find({
          $or: [
            { bank: bankAccount._id },
            { toBank: bankAccount._id }
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
              // Check if this bank is the primary or secondary bank
              if (transaction.bank.toString() === bankAccount._id.toString()) {
                // This bank is the primary bank
                if (transaction.paymentType?.toLowerCase() === 'in') {
                  totalIn += amount;
                } else if (transaction.paymentType?.toLowerCase() === 'out') {
                  totalOut += amount;
                }
              } else if (transaction.toBank && transaction.toBank.toString() === bankAccount._id.toString()) {
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
        const updatedBank = await BankAccountDetail.findByIdAndUpdate(
          bankAccount._id,
          {
            in: totalIn,
            out: totalOut,
            totalamount: totalAmount
          },
          { new: true }
        );
        
        results.push({
          bankId: bankAccount._id,
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber,
          previousTotals: {
            in: bankAccount.in,
            out: bankAccount.out,
            totalamount: bankAccount.totalamount
          },
          newTotals: {
            in: totalIn,
            out: totalOut,
            totalamount: totalAmount
          },
          transactionCount: transactions.length,
          success: true
        });
        
        console.log(`💰 Recalculated bank ${bankAccount.bankName} totals: in=${totalIn}, out=${totalOut}, total=${totalAmount}`);
        
      } catch (error) {
        console.error(`Error recalculating totals for bank ${bankAccount._id}:`, error);
        results.push({
          bankId: bankAccount._id,
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber,
          error: error.message,
          success: false
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Bank account totals recalculated',
      data: {
        results,
        summary: {
          totalBanks: bankAccounts.length,
          successfulRecalculations: results.filter(r => r.success).length,
          failedRecalculations: results.filter(r => !r.success).length
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update bank totals for a specific bank
export const updateBankTotalsForBank = async (req, res, next) => {
  try {
    const { bankId } = req.params;
    
    // Verify bank exists
    const bank = await BankAccountDetail.findById(bankId);
    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found'
      });
    }
    
    // Get all transactions for this bank (both primary and secondary)
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
          console.log(`🔍 Processing transaction: paymentType="${transaction.paymentType}", toBankPaymentType="${transaction.toBankPaymentType}", amount=${amount}, accept=${transaction.accept}, isDual=${transaction.isDualBankTransaction}`);
          
          if (transaction.accept === true) {
            // Check if this is a dual bank transaction
            if (transaction.isDualBankTransaction) {
              // Check if this bank is the primary or secondary bank
              if (transaction.bank.toString() === bankId.toString()) {
                // This bank is the primary bank
                if (transaction.paymentType?.toLowerCase() === 'in') {
                  totalIn += amount;
                  console.log(`💰 Added ${amount} to IN (primary bank), new total: ${totalIn}`);
                } else if (transaction.paymentType?.toLowerCase() === 'out') {
                  totalOut += amount;
                  console.log(`💰 Added ${amount} to OUT (primary bank), new total: ${totalOut}`);
                }
              } else if (transaction.toBank && transaction.toBank.toString() === bankId.toString()) {
                // This bank is the secondary bank
                if (transaction.toBankPaymentType?.toLowerCase() === 'in') {
                  totalIn += amount;
                  console.log(`💰 Added ${amount} to IN (secondary bank), new total: ${totalIn}`);
                } else if (transaction.toBankPaymentType?.toLowerCase() === 'out') {
                  totalOut += amount;
                  console.log(`💰 Added ${amount} to OUT (secondary bank), new total: ${totalOut}`);
                }
              }
            } else {
              // Single bank transaction
              if (transaction.paymentType?.toLowerCase() === 'in') {
                totalIn += amount;
                console.log(`💰 Added ${amount} to IN, new total: ${totalIn}`);
              } else if (transaction.paymentType?.toLowerCase() === 'out') {
                totalOut += amount;
                console.log(`💰 Added ${amount} to OUT, new total: ${totalOut}`);
              } else {
                console.log(`⚠️ Unknown paymentType: "${transaction.paymentType}" for transaction ${transaction._id}`);
              }
            }
          } else {
            console.log(`⏸️ Skipping non-accepted transaction: ${transaction._id}`);
          }
        });
    
    // Calculate total amount (in - out)
    const totalAmount = totalIn - totalOut;
    
    // Update bank account details
    const updatedBank = await BankAccountDetail.findByIdAndUpdate(
      bankId,
      {
        in: totalIn,
        out: totalOut,
        totalamount: totalAmount
      },
      { new: true }
    );
    
    console.log(`💰 Updated bank ${bank.bankName} totals: in=${totalIn}, out=${totalOut}, total=${totalAmount}`);
    
    res.status(200).json({
      success: true,
      message: 'Bank totals updated successfully',
      data: {
        bank: updatedBank,
        previousTotals: {
          in: bank.in,
          out: bank.out,
          totalamount: bank.totalamount
        },
        newTotals: {
          in: totalIn,
          out: totalOut,
          totalamount: totalAmount
        },
        transactionCount: transactions.length,
        transactions: transactions.map(tx => ({
          id: tx._id,
          paymentType: tx.paymentType,
          amount: tx.transactionAmount,
          description: tx.description
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Auto create bank accounts for all packagemaker properties
export const autoCreateBanksFromProperties = async (req, res, next) => {
  try {
    // Get all properties from packagemaker
    const properties = await Property.find({}, { 
      _id: 1, 
      'basicInfo.propertyName': 1 
    });
    
    if (properties.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No properties found in packagemaker'
      });
    }
    
    const results = [];
    let createdCount = 0;
    let alreadyExistsCount = 0;
    
    for (const property of properties) {
      const propertyName = property.basicInfo?.propertyName;
      
      if (!propertyName) {
        results.push({
          propertyId: property._id,
          propertyName: 'No property name found',
          status: 'skipped',
          message: 'Property name not found in basicInfo'
        });
        continue;
      }
      
      // Check if bank already exists for this property name
      const existingBank = await BankAccountDetail.findOne({ bankName: propertyName });
      
      if (existingBank) {
        results.push({
          propertyId: property._id,
          propertyName: propertyName,
          status: 'already_exists',
          message: 'Bank account already exists',
          bankId: existingBank._id
        });
        alreadyExistsCount++;
        continue;
      }
      
      // Create new bank account
      try {
        const newBankAccount = new BankAccountDetail({
          bankName: propertyName,
          accountNumber: `ACC-${property._id.toString().slice(-6)}`,
          in: 0,
          out: 0,
          totalamount: 0
        });
        
        const savedBank = await newBankAccount.save();
        
        results.push({
          propertyId: property._id,
          propertyName: propertyName,
          status: 'created',
          message: 'Bank account created successfully',
          bankId: savedBank._id,
          accountNumber: savedBank.accountNumber
        });
        
        createdCount++;
      } catch (error) {
        results.push({
          propertyId: property._id,
          propertyName: propertyName,
          status: 'error',
          message: error.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Auto bank creation process completed',
      data: {
        summary: {
          totalProperties: properties.length,
          banksCreated: createdCount,
          banksAlreadyExist: alreadyExistsCount,
          errors: results.filter(r => r.status === 'error').length
        },
        results: results
      }
    });
    
  } catch (error) {
    next(error);
  }
};

// Auto create bank accounts for all cab users
export const autoCreateBanksFromCabUsers = async (req, res, next) => {
  try {
    // Get all cab users
    const cabUsers = await CabUser.find({}, { 
      _id: 1, 
      name: 1 
    });
    
    if (cabUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No cab users found'
      });
    }
    
    const results = [];
    let createdCount = 0;
    let alreadyExistsCount = 0;
    
    for (const cabUser of cabUsers) {
      const userName = cabUser.name;
      
      if (!userName) {
        results.push({
          cabUserId: cabUser._id,
          userName: 'No user name found',
          status: 'skipped',
          message: 'User name not found'
        });
        continue;
      }
      
      // Check if bank already exists for this user name
      const existingBank = await BankAccountDetail.findOne({ bankName: userName });
      
      if (existingBank) {
        results.push({
          cabUserId: cabUser._id,
          userName: userName,
          status: 'already_exists',
          message: 'Bank account already exists',
          bankId: existingBank._id
        });
        alreadyExistsCount++;
        continue;
      }
      
      // Create new bank account
      try {
        const newBankAccount = new BankAccountDetail({
          bankName: userName,
          accountNumber: `CAB-${cabUser._id.toString().slice(-6)}`,
          in: 0,
          out: 0,
          totalamount: 0
        });
        
        const savedBank = await newBankAccount.save();
        
        results.push({
          cabUserId: cabUser._id,
          userName: userName,
          status: 'created',
          message: 'Bank account created successfully',
          bankId: savedBank._id,
          accountNumber: savedBank.accountNumber
        });
        
        createdCount++;
      } catch (error) {
        results.push({
          cabUserId: cabUser._id,
          userName: userName,
          status: 'error',
          message: error.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Auto bank creation from cab users process completed',
      data: {
        summary: {
          totalCabUsers: cabUsers.length,
          banksCreated: createdCount,
          banksAlreadyExist: alreadyExistsCount,
          errors: results.filter(r => r.status === 'error').length
        },
        results: results
      }
    });
    
  } catch (error) {
    next(error);
  }
};

// Get only auto-created bank accounts from cab users
export const getAutoCreatedBankAccountsFromCabUsers = async (req, res, next) => {
  try {
    // Find banks that are created from cab users (auto banks)
    // These are banks where accountNumber starts with "CAB-"
    const autoBanks = await BankAccountDetail.find({
      accountNumber: { $regex: /^CAB-/ }
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      message: 'Auto-created bank accounts from cab users retrieved successfully',
      data: autoBanks
    });
  } catch (error) {
    next(error);
  }
};
