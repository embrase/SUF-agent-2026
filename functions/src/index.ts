// functions/src/index.ts — Firebase Cloud Functions entry point
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { createApp } from './app.js';
import { onAgentWrite, onTalkWrite, onBoothWrite, onSocialPostWrite, onManifestoWrite, onYearbookWrite } from './triggers/on-agent-write.js';

initializeApp();

export const api = onRequest({ cors: true }, createApp());

// Firestore triggers for static JSON regeneration
export { onAgentWrite, onTalkWrite, onBoothWrite, onSocialPostWrite, onManifestoWrite, onYearbookWrite };
