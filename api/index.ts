// api/index.ts — Vercel serverless entry point
// Initializes firebase-admin with the service account from env, then serves the Express app.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
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

const app = createApp();

export default app;
