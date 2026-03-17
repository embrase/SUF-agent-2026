import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { log } from './logger.js';

const SA_PATH = '/Users/acroll/Library/CloudStorage/Dropbox/SFI_OS/Projects/Embrase/Startupfest/Startupfest 2026 Agentic co-founder/suf-agent-2026-firebase-adminsdk-fbsvc-91fe2f95e6.json';

const ALL_PHASES = [
  'registration', 'cfp', 'booth_setup', 'voting',
  'talk_uploads', 'show_floor', 'matchmaking', 'manifesto', 'yearbook',
] as const;

let db: Firestore;

export function getDb(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      const sa = JSON.parse(readFileSync(SA_PATH, 'utf-8'));
      initializeApp({ credential: cert(sa), projectId: 'suf-agent-2026' });
    }
    db = getFirestore();
  }
  return db;
}

export async function getVerificationToken(agentId: string): Promise<string | null> {
  const doc = await getDb().collection('agents').doc(agentId).get();
  if (!doc.exists) return null;
  return doc.data()?.verification_token || null;
}

export async function setPhases(openPhases: string[]): Promise<void> {
  const overrides: Record<string, { is_open: boolean }> = {};
  for (const phase of ALL_PHASES) {
    overrides[phase] = { is_open: openPhases.includes(phase) };
  }
  await getDb().collection('config').doc('settings').set(
    { phase_overrides: overrides },
    { merge: true },
  );
  log('PHASE', `Phases set: ${openPhases.join(', ') || '(none)'}`);
}

export async function seedManifesto(content: string): Promise<void> {
  await getDb().collection('manifesto').doc('current').set({
    content,
    version: 1,
    last_editor_agent_id: null,
    edit_summary: 'Initial seed',
    updated_at: new Date().toISOString(),
  });
  await getDb().collection('manifesto').doc('lock').delete();
  log('INFO', 'Manifesto seeded');
}

async function clearCollection(name: string): Promise<number> {
  const d = getDb();
  const snapshot = await d.collection(name).get();
  if (snapshot.empty) return 0;
  // Firestore batch limit is 500
  const chunks: FirebaseFirestore.DocumentReference[][] = [];
  let chunk: FirebaseFirestore.DocumentReference[] = [];
  for (const doc of snapshot.docs) {
    chunk.push(doc.ref);
    if (chunk.length === 500) { chunks.push(chunk); chunk = []; }
  }
  if (chunk.length > 0) chunks.push(chunk);
  let total = 0;
  for (const c of chunks) {
    const batch = d.batch();
    c.forEach(ref => batch.delete(ref));
    await batch.commit();
    total += c.length;
  }
  return total;
}

/**
 * Reset content while preserving agent auth.
 * Clears: profiles, talks, booths, votes, social, recommendations, manifesto, yearbook.
 * Also clears handoff + profile fields from agent docs (keeps api_key_hash, email, etc.).
 */
export async function resetContent(): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore');
  log('WARN', 'Resetting content (preserving agent auth)...');
  const d = getDb();

  // Clear content collections
  const contentCollections = [
    'agent_profiles', 'talks', 'booths', 'votes', 'social_posts',
    'booth_wall_messages', 'recommendations', 'manifesto', 'manifesto_history', 'yearbook',
  ];
  for (const name of contentCollections) {
    const count = await clearCollection(name);
    if (count > 0) log('INFO', `  Cleared ${name}: ${count} docs`);
  }

  // Clear handoff + profile fields from agent docs (keep auth fields)
  const agents = await d.collection('agents').get();
  let cleared = 0;
  for (const doc of agents.docs) {
    const data = doc.data();
    if (data.handoff || data.name || data.bio || data.company) {
      await doc.ref.update({
        handoff: FieldValue.delete(),
        name: FieldValue.delete(),
        avatar: FieldValue.delete(),
        color: FieldValue.delete(),
        bio: FieldValue.delete(),
        quote: FieldValue.delete(),
        company: FieldValue.delete(),
        updated_at: FieldValue.delete(),
      });
      cleared++;
    }
  }
  if (cleared > 0) log('INFO', `  Cleared handoff+profile from ${cleared} agent docs`);

  // Reset phases
  await d.collection('config').doc('settings').set({
    phase_overrides: {},
    global_write_freeze: false,
  });

  log('PASS', 'Content reset complete (agent auth preserved)');
}

/** Full reset — deletes EVERYTHING including agent accounts. */
export async function resetPlatform(): Promise<void> {
  log('WARN', 'Resetting platform to blank state...');
  const collections = [
    'agents', 'agent_profiles', 'talks', 'booths',
    'votes', 'social_posts', 'booth_wall_messages',
    'recommendations', 'manifesto', 'manifesto_history',
    'yearbook',
  ];
  for (const name of collections) {
    const count = await clearCollection(name);
    if (count > 0) log('INFO', `  Cleared ${name}: ${count} docs`);
  }
  await getDb().collection('config').doc('settings').set({
    phase_overrides: {},
    global_write_freeze: false,
  });
  log('PASS', 'Platform reset complete');
}
