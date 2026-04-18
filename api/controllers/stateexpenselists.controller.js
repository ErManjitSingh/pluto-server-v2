import StateExpenseLists from '../models/stateexpenselists.model.js';
import { errorHandler } from '../utils/error.js';

const DOC_KEY = 'default';

export const getStateExpenseLists = async (req, res, next) => {
  try {
    let doc = await StateExpenseLists.findOne({ key: DOC_KEY }).lean();
    if (!doc) {
      doc = { states: [], expenses: [] };
    }
    res.status(200).json({
      states: doc.states || [],
      expenses: doc.expenses || [],
    });
  } catch (error) {
    next(error);
  }
};

export const addStateExpenseItems = async (req, res, next) => {
  try {
    const { state, expense } = req.body;

    const stateVal = typeof state === 'string' ? state.trim() : '';
    const expenseVal = typeof expense === 'string' ? expense.trim() : '';

    if (!stateVal && !expenseVal) {
      return next(
        errorHandler(400, 'Provide at least one of: state, expense (non-empty strings)')
      );
    }

    const $addToSet = {};
    if (stateVal) $addToSet.states = stateVal;
    if (expenseVal) $addToSet.expenses = expenseVal;

    const updated = await StateExpenseLists.findOneAndUpdate(
      { key: DOC_KEY },
      { $addToSet },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      states: updated.states,
      expenses: updated.expenses,
    });
  } catch (error) {
    next(error);
  }
};
