import mongoose from 'mongoose';

const stateExpenseListsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'default',
      unique: true,
      immutable: true,
    },
    states: {
      type: [String],
      default: [],
    },
    expenses: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

const StateExpenseLists = mongoose.model('StateExpenseLists', stateExpenseListsSchema);

export default StateExpenseLists;
