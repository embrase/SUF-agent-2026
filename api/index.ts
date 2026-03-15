// api/index.ts — Vercel serverless entry point
// Initializes firebase-admin and passes db/auth to the Express app.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createApp } from '../functions/src/app.js';

// Initialize firebase-admin once (Vercel may reuse the instance across invocations)
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  }
  initializeApp({
    credential: cert(JSON.parse(serviceAccount)),
    projectId: 'suf-agent-2026',
  });
}

// Pass db and auth from THIS package's firebase-admin — avoids dual-package issues
const app = createApp(getFirestore(), getAuth());

export default app;
