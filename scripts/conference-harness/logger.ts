import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const LOG_DIR = join(import.meta.dirname, 'logs');
mkdirSync(LOG_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_FILE = join(LOG_DIR, `harness-${timestamp}.log`);

type Level = 'INFO' | 'WARN' | 'ERROR' | 'PASS' | 'FAIL' | 'PHASE';

export function log(level: Level, message: string, data?: any) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}]`;
  const line = data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;

  const colors: Record<Level, string> = {
    INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m',
    PASS: '\x1b[32m', FAIL: '\x1b[31m', PHASE: '\x1b[35m',
  };
  console.log(`${colors[level]}${line}\x1b[0m`);
  appendFileSync(LOG_FILE, line + '\n');
}

export function getLogFile() { return LOG_FILE; }
