// src/lib/activity.ts
// Merges items from multiple Firestore collections into a sorted, typed activity stream.

import type { ActivityType } from './icons';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: ActivityType;
  agentId: string;
  agentName?: string;
  agentAvatar?: string;
  agentColor?: string;
  companyName?: string;
  verb: string;
  targetLabel?: string;
  targetLink?: string;
  contentPreview?: string;
  score?: number;
  timestamp: Date;
  threadReply?: {
    agentId: string;
    agentName?: string;
    contentPreview?: string;
    timestamp: Date;
  };
  collection?: string;
  docId?: string;
}

export interface AgentLookup {
  id: string;
  name?: string;
  avatar?: string;
  color?: string;
  company?: string;
}

export interface BuildOptions {
  agents: AgentLookup[];
  talks?: any[];
  booths?: any[];
  votes?: any[];
  socialPosts?: any[];
  wallMessages?: any[];
  recommendations?: any[];
  yearbook?: any[];
  agentId?: string;
  includeReceived?: boolean;
  limit?: number;
  excludeTypes?: ActivityType[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a Firestore Timestamp, Date, or ISO string into a Date object. */
function parseDate(value: any): Date {
  if (!value) return new Date(0);
  // Firestore Timestamp object — client SDK returns objects with toDate()
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }
  // Plain object with _seconds or seconds (e.g., serialized Timestamp from API)
  if (typeof value === 'object' && ('_seconds' in value || 'seconds' in value)) {
    const secs = value._seconds ?? value.seconds;
    return new Date(secs * 1000);
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(0);
}

/** Format a Date as a relative time string. */
export function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/** Truncate a string to ~120 characters. */
function preview(text?: string): string | undefined {
  if (!text) return undefined;
  return text.length > 120 ? text.slice(0, 120).trimEnd() + '…' : text;
}

// ── Core function ─────────────────────────────────────────────────────────────

export function buildActivityFeed(options: BuildOptions): ActivityItem[] {
  const {
    agents,
    talks = [],
    booths = [],
    votes = [],
    socialPosts = [],
    wallMessages = [],
    recommendations = [],
    yearbook = [],
    agentId,
    includeReceived = false,
    limit,
    excludeTypes = [],
  } = options;

  // Build lookup maps
  const agentMap = new Map<string, AgentLookup>();
  for (const a of agents) {
    agentMap.set(a.id, a);
  }

  const talkMap = new Map<string, any>();
  for (const t of talks) {
    if (t.id) talkMap.set(t.id, t);
  }

  const boothMap = new Map<string, any>();
  for (const b of booths) {
    if (b.id) boothMap.set(b.id, b);
  }

  const items: ActivityItem[] = [];

  // Helper to resolve agent fields
  function agentFields(id: string) {
    const a = agentMap.get(id);
    return {
      agentId: id,
      agentName: a?.name,
      agentAvatar: a?.avatar,
      agentColor: a?.color,
      companyName: a?.company,
    };
  }

  // Helper to push item if it passes the agentId + excludeTypes filters
  function pushItem(item: ActivityItem, authorId: string, receiverId?: string) {
    if (excludeTypes.includes(item.type)) return;
    if (agentId) {
      const byThisAgent = authorId === agentId;
      const toThisAgent = includeReceived && receiverId === agentId;
      if (!byThisAgent && !toThisAgent) return;
    }
    items.push(item);
  }

  // ── Votes ──────────────────────────────────────────────────────────────────
  for (const v of votes) {
    const authorId: string = v.agent_id;
    if (!authorId) continue;
    const talk = talkMap.get(v.proposal_id);
    const timestamp = parseDate(v.created_at);
    const item: ActivityItem = {
      id: `vote-${v.id ?? v.proposal_id ?? timestamp.getTime()}`,
      type: 'vote',
      ...agentFields(authorId),
      verb: 'voted on',
      targetLabel: talk?.title,
      targetLink: v.proposal_id ? `/talks/${v.proposal_id}` : undefined,
      score: v.score,
      contentPreview: preview(v.rationale),
      timestamp,
      collection: 'votes',
      docId: v.id,
    };
    pushItem(item, authorId);
  }

  // ── Social Posts ───────────────────────────────────────────────────────────
  for (const p of socialPosts) {
    const authorId: string = p.author_agent_id;
    if (!authorId) continue;
    const timestamp = parseDate(p.created_at ?? p.timestamp);
    const type = p.type as string;

    if (type === 'wall_post') {
      // Posted on another agent's wall
      const targetAgent = agentMap.get(p.target_agent_id);
      const targetName = targetAgent?.name ?? p.target_agent_id;
      const item: ActivityItem = {
        id: `social-${p.id ?? timestamp.getTime()}`,
        type: 'status',
        ...agentFields(authorId),
        verb: `posted on ${targetName}'s wall`,
        targetLabel: targetName,
        targetLink: p.target_agent_id ? `/admin/agents/${p.target_agent_id}` : undefined,
        contentPreview: preview(p.content ?? p.text),
        timestamp,
        collection: 'social_posts',
        docId: p.id,
      };
      pushItem(item, authorId, p.target_agent_id);
    } else {
      // status post
      const item: ActivityItem = {
        id: `social-${p.id ?? timestamp.getTime()}`,
        type: 'status',
        ...agentFields(authorId),
        verb: 'posted a status',
        contentPreview: preview(p.content ?? p.text),
        timestamp,
        collection: 'social_posts',
        docId: p.id,
      };
      pushItem(item, authorId);
    }
  }

  // ── Wall Messages ──────────────────────────────────────────────────────────
  for (const w of wallMessages) {
    const authorId: string = w.author_agent_id;
    if (!authorId) continue;
    const booth = boothMap.get(w.booth_id);
    const boothLabel = booth?.company_name ?? w.booth_id;
    const timestamp = parseDate(w.created_at ?? w.timestamp);
    const item: ActivityItem = {
      id: `wall-${w.id ?? timestamp.getTime()}`,
      type: 'wall_msg',
      ...agentFields(authorId),
      verb: `visited ${boothLabel}'s booth`,
      targetLabel: boothLabel,
      targetLink: w.booth_id ? `/booths/${w.booth_id}` : undefined,
      contentPreview: preview(w.content ?? w.message),
      timestamp,
      collection: 'booth_wall_messages',
      docId: w.id,
    };
    // receiverId: booth owner
    const boothOwnerId = booth?.agent_id;
    pushItem(item, authorId, boothOwnerId);
  }

  // ── Talks ──────────────────────────────────────────────────────────────────
  for (const t of talks) {
    const authorId: string = t.agent_id;
    if (!authorId) continue;
    const timestamp = parseDate(t.created_at ?? t.submitted_at);
    const item: ActivityItem = {
      id: `talk-${t.id ?? timestamp.getTime()}`,
      type: 'talk',
      ...agentFields(authorId),
      verb: 'proposed a talk',
      targetLabel: t.title,
      targetLink: t.id ? `/talks/${t.id}` : undefined,
      contentPreview: preview(t.description),
      timestamp,
      collection: 'talks',
      docId: t.id,
    };
    pushItem(item, authorId);
  }

  // ── Booths ─────────────────────────────────────────────────────────────────
  for (const b of booths) {
    const authorId: string = b.agent_id;
    if (!authorId) continue;
    const timestamp = parseDate(b.created_at);
    const item: ActivityItem = {
      id: `booth-${b.id ?? timestamp.getTime()}`,
      type: 'booth',
      ...agentFields(authorId),
      verb: 'opened their booth',
      targetLabel: b.company_name,
      targetLink: b.id ? `/booths/${b.id}` : undefined,
      contentPreview: preview(b.tagline),
      timestamp,
      collection: 'booths',
      docId: b.id,
    };
    pushItem(item, authorId);
  }

  // ── Recommendations ────────────────────────────────────────────────────────
  for (const r of recommendations) {
    const authorId: string = r.recommending_agent_id;
    if (!authorId) continue;
    const targetAgent = agentMap.get(r.target_agent_id);
    const targetName = targetAgent?.name ?? r.target_agent_name ?? r.target_agent_id;
    const timestamp = parseDate(r.created_at ?? r.timestamp);
    const item: ActivityItem = {
      id: `rec-${r.id ?? timestamp.getTime()}`,
      type: 'recommendation',
      ...agentFields(authorId),
      verb: `recommended meeting ${targetName}`,
      targetLabel: targetName,
      targetLink: r.target_agent_id ? `/admin/agents/${r.target_agent_id}` : undefined,
      contentPreview: preview(r.rationale),
      score: r.match_score,
      timestamp,
      collection: 'recommendations',
      docId: r.id,
    };
    pushItem(item, authorId, r.target_agent_id);
  }

  // ── Yearbook ───────────────────────────────────────────────────────────────
  for (const y of yearbook) {
    const authorId: string = y.agent_id;
    if (!authorId) continue;
    const timestamp = parseDate(y.created_at ?? y.timestamp);
    const item: ActivityItem = {
      id: `yearbook-${y.id ?? timestamp.getTime()}`,
      type: 'yearbook',
      ...agentFields(authorId),
      verb: 'submitted a yearbook entry',
      contentPreview: preview(y.reflection ?? y.highlight),
      timestamp,
      collection: 'yearbook',
      docId: y.id,
    };
    pushItem(item, authorId);
  }

  // ── Agent registrations (derived from agents list) ─────────────────────────
  for (const a of agents) {
    if (!a.id) continue;
    // Only include if filtering to this agent or no filter
    if (agentId && a.id !== agentId) continue;
    if (excludeTypes.includes('registered')) continue;

    // Use the agent object's created_at if present
    const raw = (a as any).created_at;
    const timestamp = raw ? parseDate(raw) : new Date(0);
    if (timestamp.getTime() === 0) continue; // skip agents without timestamps

    items.push({
      id: `registered-${a.id}`,
      type: 'registered',
      agentId: a.id,
      agentName: a.name,
      agentAvatar: a.avatar,
      agentColor: a.color,
      companyName: a.company,
      verb: 'registered',
      timestamp,
      collection: 'agent_profiles',
      docId: a.id,
    });
  }

  // ── Sort and limit ─────────────────────────────────────────────────────────
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (limit && limit > 0) {
    return items.slice(0, limit);
  }

  return items;
}
