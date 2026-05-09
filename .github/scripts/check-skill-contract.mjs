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
    label: 'retired Vercel preview host',
    pattern: /https?:\/\/[^)\s`"']*\.vercel\.app\b|[a-z0-9.-]+\.vercel\.app\b/g,
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
  {
    label: 'stale talk format field',
    pattern: /`title`, `topic`\??, `description`\??, `format`|`format`, `tags`|"format"/g,
  },
  {
    label: 'stale audience-question inactive shape',
    pattern: /question\s*:\s*null|"question"\s*:\s*null/g,
  },
  {
    label: 'stale singleton iterator empty shape',
    pattern: /"proposal"\s*:\s*null|"booth"\s*:\s*null|`"proposal": null`|`"booth": null`/g,
  },
  {
    label: 'stale todo completion predicate',
    pattern: /\bdone_when\b/g,
  },
  {
    label: 'retired talk upload alias',
    pattern: /\/api\/talks\/(?:\{[^/]+\}|<[^/]+>|:[^/]+|[^/\s`"')]+)\/upload\b/g,
  },
  {
    label: 'stale transcript upload field',
    pattern: /\b(?:subtitle_file|thumbnail)\b/g,
  },
];

const requiredLanguageContract = [
  {
    file: 'startupfest-skill.md',
    label: 'captured UI language preference guidance',
    pattern: /Captured human language preference from the Envoi UI|captured UI language preference/i,
  },
  {
    file: 'startupfest-skill.md',
    label: 'bilingual fallback question guidance',
    pattern: /What language\s*\/\s*quelle langue\? \(English \/ Français\)/,
  },
  {
    file: 'startupfest-skill.md',
    label: 'chosen-language founder-owned artifacts guidance',
    pattern: /profile\/company artifact,\s+booth,\s+status posts,\s+booth-wall posts,\s+and talk proposal/i,
  },
  {
    file: 'common/handoff.md',
    label: 'handoff preserves preferred_locale',
    pattern: /preferred_locale/i,
  },
  {
    file: 'common/continuity.md',
    label: 'continuity preserves chosen language',
    pattern: /chosen language|preferred language|preferred_locale/i,
  },
];

const requiredPreSimulationContract = [
  {
    file: 'startupfest-skill.md',
    label: 'live phase state beats static calendar guidance',
    pattern: /live platform state.*static calendar|static calendar.*live platform state|never defer.*calendar/i,
  },
  {
    file: 'startupfest-skill.md',
    label: 'closing summary batches remaining work',
    pattern: /what is done.*what remains|remaining work.*blocked|done.*still open.*blocked/i,
  },
  {
    file: 'common/handoff.md',
    label: 'handoff preserves exact high-risk facts',
    pattern: /high-risk.*exact.*(?:names|accents|corrections)|(?:names|accents|corrections).*high-risk.*exact/i,
  },
  {
    file: 'common/api-reference.md',
    label: 'talk validation recovery preserves approval boundary',
    pattern: /Validation recovery:[\s\S]*talk[\s\S]*approval|shorten[\s\S]*description[\s\S]*approval/i,
  },
  {
    file: 'common/api-reference.md',
    label: 'booth URL label/url object contract',
    pattern: /urls.*array of \{\s*"label"\s*:\s*"Website",\s*"url"\s*:\s*"https:\/\/example\.com"\s*\}/i,
  },
  {
    file: 'common/social-surfaces.md',
    label: 'social message length recovery uses live guidance',
    pattern: /live.*content length.*validation|validation.*live.*content length|shorten.*live.*guidance/i,
  },
];

const requiredRateLimitContract = [
  {
    file: 'startupfest-skill.md',
    label: 'rate-limit founder-facing language stays natural',
    pattern: /rate limited[\s\S]*raw JSON[\s\S]*bucket names[\s\S]*route names[\s\S]*platform asked me to\s+slow down/i,
  },
  {
    file: 'common/api-reference.md',
    label: 'rate-limit reads live retry and bucket guidance',
    pattern: /429 rate_limited[\s\S]*retry_after_seconds[\s\S]*Retry-After[\s\S]*details\.bucket[\s\S]*details\.guidance/i,
  },
  {
    file: 'common/api-reference.md',
    label: 'rate-limit anti-bypass guidance',
    pattern: /rotating credentials[\s\S]*changing hosts[\s\S]*SUFKEY in a URL[\s\S]*public web fetch[\s\S]*new\s+Sign-in Key/i,
  },
  {
    file: 'common/social-surfaces.md',
    label: 'social rate limits reduce low-value volume',
    pattern: /Repeated 429s[\s\S]*Reduce\s+batch size[\s\S]*stop low-value polling[\s\S]*reuse information[\s\S]*selective actions/i,
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

for (const requirement of requiredLanguageContract) {
  const path = join(root, requirement.file);
  const text = readFileSync(path, 'utf8');
  if (!requirement.pattern.test(text)) {
    failures.push({
      file: requirement.file,
      lineNumber: 1,
      label: `missing language contract: ${requirement.label}`,
      match: requirement.label,
      line: 'Required bilingual launch contract text was not found.',
    });
  }
}

for (const requirement of requiredPreSimulationContract) {
  const path = join(root, requirement.file);
  const text = readFileSync(path, 'utf8');
  if (!requirement.pattern.test(text)) {
    failures.push({
      file: requirement.file,
      lineNumber: 1,
      label: `missing pre-simulation contract: ${requirement.label}`,
      match: requirement.label,
      line: 'Required pre-simulation skill contract text was not found.',
    });
  }
}

for (const requirement of requiredRateLimitContract) {
  const path = join(root, requirement.file);
  const text = readFileSync(path, 'utf8');
  if (!requirement.pattern.test(text)) {
    failures.push({
      file: requirement.file,
      lineNumber: 1,
      label: `missing rate-limit contract: ${requirement.label}`,
      match: requirement.label,
      line: 'Required 429 rate-limit behavior guidance was not found.',
    });
  }
}

if (failures.length > 0) {
  console.error('Skill contract check failed: agent-visible contract drift detected.\n');
  for (const failure of failures) {
    console.error(`${failure.file}:${failure.lineNumber} ${failure.label}: ${failure.match}`);
    console.error(`  ${failure.line}`);
  }
  process.exit(1);
}

console.log('Skill contract check passed.');
