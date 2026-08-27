import fs from 'fs';
import path from 'path';

export interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

let cachedConfig: FirebaseConfig | null = null;

export function getFirebaseConfig(): FirebaseConfig {
  if (cachedConfig) return cachedConfig;

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      cachedConfig = JSON.parse(raw);
      return cachedConfig!;
    }
  } catch (err) {
    console.warn('Failed to load firebase-applet-config.json, falling back to env/defaults', err);
  }

  cachedConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'crafty-flow-glcf1',
    appId: process.env.FIREBASE_APP_ID || '1:173076222324:web:56cc5468fbb0aaf42c5c21',
    apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyAcWfHwzN4p0ZHjid8mTrB6ugR70iUMlo8',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'crafty-flow-glcf1.firebaseapp.com',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'crafty-flow-glcf1.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '173076222324',
  };

  return cachedConfig;
}
