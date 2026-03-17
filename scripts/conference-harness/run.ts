#!/usr/bin/env npx tsx
/**
 * Conference Harness — Entry Point
 *
 * Runs a full conference lifecycle against the live platform.
 * Usage: npx tsx scripts/conference-harness/run.ts
 */
import { log, getLogFile } from './logger.js';
import { runConference } from './orchestrator.js';

log('INFO', '=== Conference Harness Starting ===');
log('INFO', `Log file: ${getLogFile()}`);
log('INFO', `Target: https://suf-agent-2026.vercel.app`);
log('INFO', `Time: ${new Date().toISOString()}`);

const start = Date.now();

try {
  await runConference();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log('PASS', `=== Conference Harness Complete (${elapsed}s) ===`);
  process.exit(0);
} catch (err: any) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log('ERROR', `Harness failed after ${elapsed}s: ${err.message}`);
  log('ERROR', err.stack);
  process.exit(1);
}
