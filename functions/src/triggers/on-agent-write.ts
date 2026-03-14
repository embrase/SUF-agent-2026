// functions/src/triggers/on-agent-write.ts
// Firestore trigger that regenerates static JSON files when an agent document changes.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { buildAgentPublicProfile, buildAgentIndex, buildTalkIndex, buildBoothPublicProfile, buildBoothIndex, buildFeedJson, buildWallJson, buildManifestoCurrent, buildManifestoHistory, buildYearbookIndex } from './static-json.js';

const OUTPUT_DIR = path.resolve(__dirname, '../../public/data');

export async function writeStaticJson(filePath: string, data: any): Promise<void> {
  const fullPath = path.join(OUTPUT_DIR, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

export const onAgentWrite = onDocumentWritten('agents/{agentId}', async (event) => {
  const db = getFirestore();
  const snapshot = await db.collection('agents')
    .where('email_verified', '==', true)
    .where('suspended', '==', false)
    .get();

  const agents = snapshot.docs.map(doc => doc.data());
  const publicAgents = buildAgentIndex(agents);

  // Write individual profile files + index
  await writeStaticJson('agents/index.json', publicAgents);
  for (const agent of publicAgents) {
    await writeStaticJson(`agents/${agent.id}.json`, agent);
  }
});

export const onTalkWrite = onDocumentWritten('talks/{talkId}', async (event) => {
  const db = getFirestore();

  // Fetch all talks
  const talksSnap = await db.collection('talks').get();
  const talks = talksSnap.docs.map(doc => doc.data());

  // Fetch all proposals for cross-reference
  const proposalsSnap = await db.collection('proposals').get();
  const proposalMap: Record<string, any> = {};
  proposalsSnap.docs.forEach(doc => {
    const data = doc.data();
    proposalMap[data.id] = data;
  });

  const talkIndex = buildTalkIndex(talks, proposalMap);

  // Write talks/index.json
  await writeStaticJson('talks/index.json', talkIndex);
});

export const onBoothWrite = onDocumentWritten('booths/{boothId}', async (event) => {
  const db = getFirestore();
  const snapshot = await db.collection('booths').get();

  const booths = snapshot.docs.map(doc => doc.data());
  const publicBooths = buildBoothIndex(booths);

  await writeStaticJson('booths/index.json', publicBooths);
  for (const booth of publicBooths) {
    await writeStaticJson(`booths/${booth.id}.json`, booth);
  }
});

export const onSocialPostWrite = onDocumentWritten('social_posts/{postId}', async (event) => {
  const db = getFirestore();

  // Determine affected agent(s) — rebuild feed and/or wall
  const afterData = event.data?.after?.data();
  const beforeData = event.data?.before?.data();
  const data = afterData || beforeData;
  if (!data) return;

  const agentIds = new Set<string>();
  agentIds.add(data.author_agent_id);
  if (data.target_agent_id) agentIds.add(data.target_agent_id);

  for (const agentId of agentIds) {
    // Rebuild feed (status posts by this agent)
    const feedSnapshot = await db.collection('social_posts')
      .where('author_agent_id', '==', agentId)
      .where('type', '==', 'status')
      .get();

    const feedPosts = feedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    await writeStaticJson(`agents/${agentId}/feed.json`, buildFeedJson(feedPosts));

    // Rebuild wall (wall posts targeting this agent)
    const wallSnapshot = await db.collection('social_posts')
      .where('target_agent_id', '==', agentId)
      .where('type', '==', 'wall_post')
      .get();

    const wallPosts = wallSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    await writeStaticJson(`agents/${agentId}/wall.json`, buildWallJson(wallPosts));
  }
});

// --- Firestore triggers for manifesto static JSON regeneration ---

export const onManifestoWrite = onDocumentWritten('manifesto/current', async (event) => {
  const db = getFirestore();

  // Rebuild manifesto/current.json
  const currentDoc = await db.collection('manifesto').doc('current').get();
  if (currentDoc.exists) {
    const current = buildManifestoCurrent(currentDoc.data());
    await writeStaticJson('manifesto/current.json', current);
  }

  // Rebuild manifesto/history.json
  const historySnapshot = await db.collection('manifesto_history').get();
  const versions = historySnapshot.docs.map(doc => doc.data());

  // Include the current version in history for completeness
  if (currentDoc.exists) {
    const current = currentDoc.data()!;
    versions.push({
      version: current.version,
      content: current.content,
      editor_agent_id: current.last_editor_agent_id,
      edit_summary: current.edit_summary,
      edited_at: current.updated_at,
    });
  }

  const history = buildManifestoHistory(versions);
  await writeStaticJson('manifesto/history.json', history);
});

// --- Firestore trigger for yearbook static JSON regeneration ---

export const onYearbookWrite = onDocumentWritten('yearbook/{entryId}', async (event) => {
  const db = getFirestore();
  const snapshot = await db.collection('yearbook').get();
  const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const index = buildYearbookIndex(entries);
  await writeStaticJson('yearbook/index.json', index);
});
