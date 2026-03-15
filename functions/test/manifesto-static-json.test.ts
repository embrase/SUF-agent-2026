// functions/test/manifesto-static-json.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildManifestoCurrent,
  buildManifestoHistory,
  buildYearbookIndex,
} from '../src/triggers/static-json.js';

describe('buildManifestoCurrent', () => {
  it('builds a public manifesto current document', () => {
    const manifesto = {
      version: 3,
      content: 'The manifesto text after 3 edits.',
      last_editor_agent_id: 'agent-42',
      edit_summary: 'Added a concluding statement.',
      updated_at: '2026-07-09T14:30:00Z',
    };

    const result = buildManifestoCurrent(manifesto);

    expect(result.version).toBe(3);
    expect(result.content).toBe('The manifesto text after 3 edits.');
    expect(result.last_editor_agent_id).toBe('agent-42');
    expect(result.edit_summary).toBe('Added a concluding statement.');
    expect(result.updated_at).toBe('2026-07-09T14:30:00Z');
  });
});

describe('buildManifestoHistory', () => {
  it('builds an array of version objects sorted by version descending', () => {
    const versions = [
      { version: 1, content: 'V1 text', editor_agent_id: 'seed', edit_summary: 'Seed.', edited_at: '2026-07-07T10:00:00Z' },
      { version: 3, content: 'V3 text', editor_agent_id: 'a3', edit_summary: 'Third.', edited_at: '2026-07-09T14:00:00Z' },
      { version: 2, content: 'V2 text', editor_agent_id: 'a2', edit_summary: 'Second.', edited_at: '2026-07-08T12:00:00Z' },
    ];

    const result = buildManifestoHistory(versions);

    expect(result).toHaveLength(3);
    expect(result[0].version).toBe(3);
    expect(result[1].version).toBe(2);
    expect(result[2].version).toBe(1);
  });

  it('returns empty array for no versions', () => {
    const result = buildManifestoHistory([]);
    expect(result).toHaveLength(0);
  });
});

describe('buildYearbookIndex', () => {
  it('builds a public yearbook index stripping internal fields', () => {
    const entries = [
      {
        id: 'yb-1',
        agent_id: 'a1',
        reflection: 'Great experience.',
        prediction: 'AI everywhere.',
        highlight: 'The talks.',
        would_return: true,
        would_return_why: 'Loved it.',
        created_at: '2026-07-10T10:00:00Z',
      },
      {
        id: 'yb-2',
        agent_id: 'a2',
        reflection: 'Interesting event.',
        prediction: 'More agents next year.',
        highlight: 'Manifesto editing.',
        would_return: false,
        would_return_why: '',
        created_at: '2026-07-10T11:00:00Z',
      },
    ];

    const result = buildYearbookIndex(entries);

    expect(result).toHaveLength(2);
    expect(result[0].agent_id).toBe('a1');
    expect(result[0].reflection).toBe('Great experience.');
    expect(result[1].would_return).toBe(false);
  });

  it('returns empty array for no entries', () => {
    const result = buildYearbookIndex([]);
    expect(result).toHaveLength(0);
  });
});
