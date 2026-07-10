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

    console.log('🔥 Before initializeApp');

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('🔥 After initializeApp');

    console.log(
      `Firebase Admin initialized for project: ${serviceAccount.project_id}`
    );
    return firebaseApp;
  } catch (error) {
    console.error('========== FIREBASE ERROR ==========');
    console.error(error);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('===================================');
    return null;
  }
};

export const verifyFirebaseIdToken = async (idToken) => {
  console.log('🔥 verifyFirebaseIdToken called');

  const app = initFirebase();

  console.log('🔥 initFirebase returned:', !!app);

  if (!app) {
    throw new Error('Firebase is not configured on the server');
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    console.log('🔥 Token verified:', decoded.uid);

    return decoded;
  } catch (err) {
    console.error('🔥 verifyIdToken ERROR');
    console.error(err);
    throw err;
  }
};

export const warmupFirebase = () => initFirebase();
