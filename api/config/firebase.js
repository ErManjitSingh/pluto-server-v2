import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let firebaseApp = null;

const resolveServiceAccountPath = (inputPath) => {
  const candidates = [
    inputPath,
    inputPath ? path.resolve(process.cwd(), inputPath) : null,
    path.join(__dirname, 'firebase-service-account.json'),
    path.resolve(process.cwd(), 'api/config/firebase-service-account.json'),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const loadServiceAccount = () => {
  const filePath =
    resolveServiceAccountPath(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) ||
    resolveServiceAccountPath(path.join(__dirname, 'firebase-service-account.json'));

  if (filePath) {
    console.log(`Firebase service account loaded from: ${filePath}`);
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
    console.log(`Firebase Admin initialized for project: ${serviceAccount.project_id}`);
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

export const warmupFirebase = () => initFirebase();
