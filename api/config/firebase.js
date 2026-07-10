import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

const normalizeServiceAccount = (serviceAccount = {}) => {
  const normalized = { ...serviceAccount };

  if (typeof normalized.private_key === 'string') {
    normalized.private_key = normalized.private_key.replace(/\\n/g, '\n');
  }

  return normalized;
};

const parseServiceAccountJson = (rawJson, sourceLabel) => {
  try {
    const parsed = normalizeServiceAccount(JSON.parse(rawJson));
    console.log(`Firebase service account parsed from: ${sourceLabel}`);
    return parsed;
  } catch (error) {
    console.error(`Failed to parse Firebase service account from ${sourceLabel}:`, error.message);
    throw error;
  }
};

const loadServiceAccount = () => {
  const filePath =
    resolveServiceAccountPath(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) ||
    resolveServiceAccountPath(path.join(__dirname, 'firebase-service-account.json'));

  if (filePath) {
    return parseServiceAccountJson(fs.readFileSync(filePath, 'utf8'), filePath);
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return parseServiceAccountJson(serviceAccountJson, 'FIREBASE_SERVICE_ACCOUNT_JSON');
  }

  return null;
};

const initFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0];
    return firebaseApp;
  }

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.warn(
        'Firebase Admin not configured. Add api/config/firebase-service-account.json or set FIREBASE_SERVICE_ACCOUNT_JSON'
      );
      return null;
    }

    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });

    console.log(`Firebase Admin initialized for project: ${serviceAccount.project_id}`);
    return firebaseApp;
  } catch (error) {
    console.error('Firebase initialization failed:', error.message);
    console.error(error.stack);
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

  return getAuth(app).verifyIdToken(idToken);
};

export const warmupFirebase = () => initFirebase();
