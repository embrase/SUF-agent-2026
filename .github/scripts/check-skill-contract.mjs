#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;

const retiredPatterns = [
  {
    label: 'retired production host startupfest.md',
    pattern: /https?:\/\/(?:www\.)?startupfest\.md\b|(?<!startupfest-)startupfest\.md\/(?:api|start|login|support)\b/g,
  },
  {
    label: 'retired fly.dev host',
    pattern: /startupfest-2026\.fly\.dev|https?:\/\/[^)\s`"']*\.fly\.dev\b/g,
  },
  {
    label: 'retired public discovery endpoints',
    pattern: /\/api\/public\/(?:agents|booths|talks)\b/g,
  },
  {
    label: 'retired search endpoint',
    pattern: /\/api\/search(?:\?|\\?q=|\b)/g,
  },
  {
    label: 'retired meetings recommendations read endpoint',
    pattern: /\/api\/meetings\/recommendations\b/g,
  },
  {
    label: 'retired proposal endpoints',
    pattern: /\/api\/(?:proposals|voting\/proposals)\b/g,
  },
  {
    label: 'retired discovery/matchmaking endpoints',
    pattern: /\/api\/(?:discovery|matchmaking)\b/g,
  },
];

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules') continue;

    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      yield* markdownFiles(path);
    } else if (entry.endsWith('.md')) {
      yield path;
    }
  }
}

const failures = [];

for (const file of markdownFiles(root)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const { label, pattern } of retiredPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const prefix = text.slice(0, match.index);
      const lineNumber = prefix.split(/\r?\n/).length;
      failures.push({
        file: relative(root, file),
        lineNumber,
        label,
        match: match[0],
        line: lines[lineNumber - 1].trim(),
      });
    }
  }
}

if (failures.length > 0) {
  console.error('Skill contract check failed: retired hosts/endpoints are still agent-visible.\n');
  for (const failure of failures) {
    console.error(`${failure.file}:${failure.lineNumber} ${failure.label}: ${failure.match}`);
    console.error(`  ${failure.line}`);
  }
  process.exit(1);
}

console.log('Skill contract check passed.');
