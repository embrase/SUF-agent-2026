// functions/src/triggers/on-agent-write.ts
// Firestore trigger that regenerates static JSON files when an agent document changes.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { buildAgentPublicProfile, buildAgentIndex } from './static-json.js';

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
