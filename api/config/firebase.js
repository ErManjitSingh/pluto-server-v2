import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let firebaseApp = null;

const loadServiceAccount = () => {
  const filePath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, 'firebase-service-account.json');

  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return JSON.parse(serviceAccountJson);
  }

  return null;
};

const initFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.warn(
        'Firebase Admin not configured. Add api/config/firebase-service-account.json or set FIREBASE_SERVICE_ACCOUNT_PATH'
      );
      return null;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return firebaseApp;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error.message);
    return null;
  }
};

export const verifyFirebaseIdToken = async (idToken) => {
  const app = initFirebase();
  if (!app) {
    const err = new Error('Firebase is not configured on the server');
    err.statusCode = 500;
    throw err;
  }

  return admin.auth().verifyIdToken(idToken);
};
