import dotenv from 'dotenv';

dotenv.config();

console.log('✅ ENV LOADED:', {
  GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI
});
