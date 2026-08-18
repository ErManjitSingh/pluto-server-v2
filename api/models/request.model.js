import mongoose from 'mongoose';
import { REQUEST_STATUS_VALUES, REQUEST_TYPE_VALUES } from '../constants/requestTypes.js';

const requestSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: REQUEST_TYPE_VALUES,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Maker',
      required: true,
      index: true,
    },
    requestedByName: {
      type: String,
      default: '',
    },
    requestedByUserType: {
      type: String,
      default: '',
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    note: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: REQUEST_STATUS_VALUES,
      default: 'PENDING',
      index: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Maker',
      default: null,
    },
    processedByName: {
      type: String,
      default: '',
    },
    processedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    actionResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ requestedBy: 1, createdAt: -1 });
requestSchema.index({ type: 1, status: 1, createdAt: -1 });

const Request = mongoose.model('Request', requestSchema);

export default Request;
