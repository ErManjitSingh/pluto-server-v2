import express from 'express';
import { connectGoogleCalendar, googleCalendarCallback, googleCalendarStatus } from '../controllers/googleCalendar.controller.js';
import { verifyToken } from '../utils/verifyUser.js';

const router = express.Router();

// Executive connects their Google Calendar
router.get('/connect', verifyToken, connectGoogleCalendar);

// Google OAuth callback (public; validates state internally)
router.get('/callback', googleCalendarCallback);

// Check if Google Calendar is connected for current maker
router.get('/status', verifyToken, googleCalendarStatus);

export default router;

