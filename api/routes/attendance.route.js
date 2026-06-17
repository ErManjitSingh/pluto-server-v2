import express from 'express';
import {
  markAttendance,
  getTodayAttendance,
  getAttendanceByUser,
  getAttendanceByUserMonth,
  getAttendanceByMonth,
  getAttendanceByTeamLeader,
  getAttendanceByManager,
  updateAttendance,
  deleteAttendance,
} from '../controllers/attendance.controller.js';

const router = express.Router();

/** Mark attendance (CRM login button) */
router.post('/mark', markAttendance);

/** Check if user already marked today — drives button UI */
router.get('/today/:userId', getTodayAttendance);

/** User attendance — ?month=2026-06 or ?date=2026-06-17 */
router.get('/user/:userId', getAttendanceByUser);

/** User month calendar */
router.get('/user/:userId/month/:month', getAttendanceByUserMonth);

/** All users for a month */
router.get('/month/:month', getAttendanceByMonth);

/** Team leader view */
router.get('/team-leader/:teamLeaderId/month/:month', getAttendanceByTeamLeader);

/** Manager view */
router.get('/manager/:managerId/month/:month', getAttendanceByManager);

router.put('/update/:id', updateAttendance);
router.delete('/delete/:id', deleteAttendance);

export default router;
