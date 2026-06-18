import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Maker',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'],
    },
    month: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'],
      index: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'half-day', 'late'],
      default: 'present',
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    userName: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      default: null,
    },
    designation: {
      type: String,
      trim: true,
      default: null,
    },
    teamLeaderId: {
      type: String,
      default: null,
    },
    teamLeaderName: {
      type: String,
      trim: true,
      default: null,
    },
    managerId: {
      type: String,
      default: null,
    },
    managerName: {
      type: String,
      trim: true,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    image: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ month: 1, userId: 1 });
attendanceSchema.index({ teamLeaderId: 1, month: 1 });
attendanceSchema.index({ managerId: 1, month: 1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
