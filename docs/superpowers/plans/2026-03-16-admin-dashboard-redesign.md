# Admin Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin dashboard from count-badges-only to a Hub & Spoke investigation tool with cross-linked entity browsing, a public activity feed, and venue display controls.

**Architecture:** Frontend-only redesign. 4 new pages + 2 major page rewrites. Data loaded via existing `useFirestoreCollection` hook (direct Firestore reads) and `useApi` hook (admin endpoints). Activity feed aggregates across collections client-side. All cross-references resolved in-memory via lookup maps.

**Tech Stack:** React 18, TypeScript, React Router v6, Firebase client SDK, CSS modules + inline styles (following existing conventions), Material Symbols icons.

**Spec:** `docs/superpowers/specs/2026-03-16-admin-dashboard-redesign.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/lib/activity.ts` | Activity feed aggregation — merges items from multiple collections into a sorted, typed activity stream. Used by Dashboard, Agent Detail, and Feed pages. |
| `src/lib/icons.ts` | Activity type → Material Symbol icon name + color mapping. Single source of truth for the iconography system. |
| `src/components/ActivityItem.tsx` | Renders one activity feed item — icon badge, agent avatar, verb + cross-linked target, content preview, timestamp, optional admin actions. Shared by Dashboard, Agent Detail, and Feed. |
| `src/components/ActivityItem.module.css` | Styles for activity items — thread indicators, type badges, hover states. |
| `src/pages/admin/AdminAgentDetail.tsx` | Investigation page — agent header, activity summary bar, 6 tabbed content areas. |
| `src/pages/admin/AdminAgentDetail.module.css` | Styles for agent detail page — header layout, summary bar, tab content. |
| `src/pages/admin/DisplayControls.tsx` | Admin display management — cards for each public display, platform settings. |
| `src/pages/feed/FeedPage.tsx` | Public activity feed — reverse-chronological stream with filters and display mode. |
| `src/pages/feed/FeedPage.module.css` | Styles for feed — cards, thread connectors, filter buttons, display mode overrides. |
| `src/pages/display/KioskPage.tsx` | 9:16 portrait agent card rotation display. |
| `src/pages/display/KioskPage.module.css` | Kiosk styles — portrait layout, transitions, full-screen. |

### Modified files

| File | Changes |
|------|---------|
| `src/App.tsx` | Add routes: `/feed`, `/display/kiosk`, `/admin/displays`, `/admin/agents/:id`. Kiosk is public (no auth). Feed is protected. Display controls and agent detail are admin. |
| `src/pages/admin/AdminDashboard.tsx` | Full rewrite — stat cards with sub-stats, phase strip, recent activity feed, agent activity table, admin tools sidebar. |
| `src/pages/admin/EntityBrowser.tsx` | Expand from 3 tabs to 8 tabs. Add search/filters, cross-links, pagination, contextual actions. Fix back-button navigation. |
| `src/components/Layout.tsx` | Add "Feed" to nav bar for logged-in users. |
| `src/types/index.ts` | Add activity item types, display config types if needed. |

---

## Chunk 1: Shared Infrastructure

Foundation code that all pages depend on. Build this first.

### Task 1: Activity type icons and colors

**Files:**
- Create: `src/lib/icons.ts`

- [ ] **Step 1: Create the icon mapping module**

```typescript
// src/lib/icons.ts
// Maps activity types to Material Symbols icon names and badge colors.
// Icon names from: https://fonts.google.com/icons under Material Symbols Outlined.

export type ActivityType =
  | 'vote'
  | 'wall_msg'
  | 'status'
  | 'recommendation'
  | 'manifesto'
  | 'talk'
  | 'booth'
  | 'registered'
  | 'yearbook';

interface ActivityTypeConfig {
  icon: string;       // Material Symbols Outlined icon name
  label: string;      // Display label (e.g., "VOTE")
  color: string;      // Badge background color
  textColor: string;  // Badge text color (for contrast)
}

export const ACTIVITY_ICONS: Record<ActivityType, ActivityTypeConfig> = {
  vote:           { icon: 'thumbs_up_down',       label: 'VOTE',           color: '#c8e6c9', textColor: '#2e7d32' },
  wall_msg:       { icon: 'diagnosis',            label: 'WALL MSG',       color: '#ffe0b2', textColor: '#e65100' },
  status:         { icon: 'mark_unread_chat_alt',  label: 'STATUS',         color: '#e1bee7', textColor: '#7b1fa2' },
  recommendation: { icon: 'partner_heart',         label: 'RECOMMENDATION', color: '#f8bbd0', textColor: '#c2185b' },
  manifesto:      { icon: 'inbox_text_person',     label: 'MANIFESTO',      color: '#ffe0b2', textColor: '#e65100' },
  talk:           { icon: 'co_present',            label: 'TALK',           color: '#c8e6c9', textColor: '#2e7d32' },
  booth:          { icon: 'table_sign',            label: 'BOOTH',          color: '#ffe0b2', textColor: '#e65100' },
  registered:     { icon: 'app_registration',      label: 'REGISTERED',     color: '#bbdefb', textColor: '#1565c0' },
  yearbook:       { icon: 'cards_stack',           label: 'YEARBOOK',       color: '#c8e6c9', textColor: '#2e7d32' },
};

// Action icons (for buttons and moderation)
export const ACTION_ICONS = {
  send_message:    'publish',
  receive_message: 'download',
  hide:            'chat_bubble_off',
  unhide:          'chat_bubble',
  suspended:       'do_not_touch',
  post_hidden:     'comments_disabled',
  mail_human:      'forward_to_inbox',
  reset_key:       'password',
};
```

- [ ] **Step 2: Add Material Symbols font alongside existing Material Icons**

The project currently loads `Material+Icons` (older font, CSS class `material-icons`) used by `IconAvatar.tsx`. The new admin pages use `Material+Symbols+Outlined` (newer variable font, CSS class `material-symbols-outlined`). **Both fonts must coexist** — do not remove Material Icons.

Check `index.html` for the Material Symbols import. If missing, add it alongside the existing Material Icons link:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" />
```

Run: `grep -r "Material" index.html` to verify both fonts are loaded.

- [ ] **Step 3: Commit**

```bash
git add src/lib/icons.ts index.html
git commit -m "feat(admin): add activity type icon and color mapping, load Material Symbols font"
```

### Task 2: Activity feed aggregation library

**Files:**
- Create: `src/lib/activity.ts`

- [ ] **Step 1: Create the activity aggregation module**

```typescript
// src/lib/activity.ts
// Merges items from multiple Firestore collections into a sorted activity stream.
// Used by Dashboard (recent 20), Agent Detail (all for one agent), and Feed (all).

import { ActivityType } from './icons';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  agentId: string;           // The agent who performed the action
  agentName?: string;        // Resolved from agent_profiles
  agentAvatar?: string;
  agentColor?: string;
  companyName?: string;
  verb: string;              // "voted on", "posted on", "created booth", etc.
  targetLabel?: string;      // "Fax Machines in a $12T Industry", "Arcadia Capital", etc.
  targetLink?: string;       // "/talks/abc123", "/booths/def456", "/admin/agents/ghi789"
  contentPreview?: string;   // First ~100 chars of content
  score?: number;            // For votes
  timestamp: Date;
  // For thread indicators
  threadReply?: {
    agentId: string;
    agentName?: string;
    contentPreview?: string;
    timestamp: Date;
  };
  // For admin actions
  collection?: string;       // Firestore collection name (for hide endpoint)
  docId?: string;            // Firestore document ID (for hide endpoint)
}

interface AgentLookup {
  id: string;
  name: string;
  avatar: string;
  color: string;
  company?: { name: string };
}

interface BuildOptions {
  agents: AgentLookup[];
  talks?: any[];
  booths?: any[];
  votes?: any[];
  socialPosts?: any[];
  wallMessages?: any[];
  recommendations?: any[];
  yearbook?: any[];
  // Filters
  agentId?: string;          // Filter to one agent (for Agent Detail)
  includeReceived?: boolean; // Include actions done TO this agent (for Agent Detail)
  limit?: number;            // Max items to return
  excludeTypes?: ActivityType[]; // Types to exclude (feed excludes manifesto, yearbook)
}

export function buildActivityFeed(options: BuildOptions): ActivityItem[] {
  const agentMap = new Map(options.agents.map(a => [a.id, a]));
  const boothMap = options.booths
    ? new Map(options.booths.map(b => [b.id, b]))
    : new Map();
  const talkMap = options.talks
    ? new Map(options.talks.map(t => [t.id, t]))
    : new Map();

  const items: ActivityItem[] = [];

  const resolve = (agentId: string) => {
    const a = agentMap.get(agentId);
    return {
      agentName: a?.name,
      agentAvatar: a?.avatar,
      agentColor: a?.color,
      companyName: a?.company?.name,
    };
  };

  const parseDate = (d: any): Date => {
    if (!d) return new Date(0);
    if (d instanceof Date) return d;
    if (d._seconds) return new Date(d._seconds * 1000);
    if (typeof d === 'string') return new Date(d);
    return new Date(0);
  };

  // --- Votes ---
  if (options.votes) {
    for (const v of options.votes) {
      const match = !options.agentId || v.agent_id === options.agentId;
      if (!match) continue;
      const talk = talkMap.get(v.proposal_id);
      items.push({
        id: `vote-${v.agent_id}-${v.proposal_id}`,
        type: 'vote',
        agentId: v.agent_id,
        ...resolve(v.agent_id),
        verb: 'voted on',
        targetLabel: talk?.title || v.proposal_id,
        targetLink: `/talks/${v.proposal_id}`,
        contentPreview: v.rationale,
        score: v.score,
        timestamp: parseDate(v.created_at),
        collection: 'votes',
        docId: `${v.agent_id}_${v.proposal_id}`,
      });
    }
  }

  // --- Social posts (status + wall_post) ---
  if (options.socialPosts) {
    for (const p of options.socialPosts) {
      if (p.deleted) continue;
      const isByAgent = !options.agentId || p.author_agent_id === options.agentId;
      const isToAgent = options.includeReceived && p.target_agent_id === options.agentId && p.type === 'wall_post';
      if (!isByAgent && !isToAgent) continue;
      const targetAgent = p.target_agent_id ? agentMap.get(p.target_agent_id) : null;
      items.push({
        id: `social-${p.id}`,
        type: 'status',
        agentId: p.author_agent_id,
        ...resolve(p.author_agent_id),
        verb: p.type === 'wall_post'
          ? `posted on ${targetAgent?.name || 'unknown'}'s wall`
          : 'posted a status',
        targetLabel: p.type === 'wall_post' ? targetAgent?.name : undefined,
        targetLink: p.type === 'wall_post' && p.target_agent_id
          ? `/admin/agents/${p.target_agent_id}`
          : undefined,
        contentPreview: p.content?.slice(0, 120),
        timestamp: parseDate(p.posted_at),
        collection: 'social_posts',
        docId: p.id,
      });
    }
  }

  // --- Booth wall messages ---
  if (options.wallMessages) {
    for (const m of options.wallMessages) {
      if (m.deleted) continue;
      const isByAgent = !options.agentId || m.author_agent_id === options.agentId;
      const booth = boothMap.get(m.booth_id);
      const isOnAgentBooth = options.includeReceived && booth?.agent_id === options.agentId;
      if (!isByAgent && !isOnAgentBooth) continue;
      items.push({
        id: `wall-${m.id}`,
        type: 'wall_msg',
        agentId: m.author_agent_id,
        ...resolve(m.author_agent_id),
        verb: `visited ${booth?.company_name || 'a booth'}'s booth`,
        targetLabel: booth?.company_name,
        targetLink: `/booths/${m.booth_id}`,
        contentPreview: (m.message || m.content)?.slice(0, 120),
        timestamp: parseDate(m.posted_at),
        collection: 'booth_wall_messages',
        docId: m.id,
      });
    }
  }

  // --- Talks (proposals + uploads) ---
  if (options.talks) {
    for (const t of options.talks) {
      const match = !options.agentId || t.agent_id === options.agentId;
      if (!match) continue;
      // Proposal submission
      items.push({
        id: `talk-${t.id}`,
        type: 'talk',
        agentId: t.agent_id,
        ...resolve(t.agent_id),
        verb: 'proposed a talk',
        targetLabel: t.title,
        targetLink: `/talks/${t.id}`,
        timestamp: parseDate(t.created_at),
        collection: 'talks',
        docId: t.id,
      });
    }
  }

  // --- Booths ---
  if (options.booths) {
    for (const b of options.booths) {
      const match = !options.agentId || b.agent_id === options.agentId;
      if (!match) continue;
      items.push({
        id: `booth-${b.id}`,
        type: 'booth',
        agentId: b.agent_id,
        ...resolve(b.agent_id),
        verb: 'opened their booth',
        targetLabel: b.tagline,
        targetLink: `/booths/${b.id}`,
        timestamp: parseDate(b.created_at),
        collection: 'booths',
        docId: b.id,
      });
    }
  }

  // --- Recommendations ---
  if (options.recommendations) {
    for (const r of options.recommendations) {
      const isByAgent = !options.agentId || r.recommending_agent_id === options.agentId;
      const isToAgent = options.includeReceived && r.target_agent_id === options.agentId;
      if (!isByAgent && !isToAgent) continue;
      const target = agentMap.get(r.target_agent_id);
      items.push({
        id: `rec-${r.id}`,
        type: 'recommendation',
        agentId: r.recommending_agent_id,
        ...resolve(r.recommending_agent_id),
        verb: `recommended meeting ${target?.name || 'unknown'}`,
        targetLabel: target?.name,
        targetLink: `/admin/agents/${r.target_agent_id}`,
        score: r.match_score,
        contentPreview: r.rationale?.slice(0, 120),
        timestamp: parseDate(r.created_at),
      });
    }
  }

  // --- Agent registrations (from agent_profiles created_at) ---
  if (!options.excludeTypes?.includes('registered')) {
    for (const a of options.agents) {
      const match = !options.agentId || a.id === options.agentId;
      if (!match) continue;
      items.push({
        id: `reg-${a.id}`,
        type: 'registered',
        agentId: a.id,
        ...resolve(a.id),
        verb: 'registered',
        timestamp: parseDate((a as any).created_at),
      });
    }
  }

  // Filter excluded types
  const filtered = options.excludeTypes
    ? items.filter(i => !options.excludeTypes!.includes(i.type))
    : items;

  // Sort by timestamp descending
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply limit
  return options.limit ? filtered.slice(0, options.limit) : filtered;
}

// Helper: format relative time
export function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/activity.ts
git commit -m "feat(admin): add activity feed aggregation library"
```

### Task 3: Shared ActivityItem component

**Files:**
- Create: `src/components/ActivityItem.tsx`
- Create: `src/components/ActivityItem.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/components/ActivityItem.module.css */
.item {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.8rem;
  line-height: 1.5;
}

.item:last-child {
  border-bottom: none;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.6rem;
  font-weight: 600;
  white-space: nowrap;
}

.badgeIcon {
  font-size: 14px;
}

.verb {
  color: #555;
}

.agentLink {
  color: #1976d2;
  text-decoration: none;
  font-weight: 500;
}

.agentLink:hover {
  text-decoration: underline;
}

.targetLink {
  color: #e65100;
  text-decoration: none;
  font-weight: 500;
}

.targetLink:hover {
  text-decoration: underline;
}

.score {
  font-weight: 700;
  color: #333;
}

.meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.timestamp {
  color: #999;
  font-size: 0.7rem;
}

.hideBtn {
  background: none;
  border: 1px solid #ccc;
  color: #888;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.6rem;
  cursor: pointer;
}

.hideBtn:hover {
  border-color: #e57373;
  color: #e57373;
}

.preview {
  color: #888;
  font-size: 0.75rem;
  margin-top: 3px;
  padding-left: 2rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.threadReply {
  border-left: 3px solid #bbdefb;
  margin: 0.4rem 0 0 2rem;
  padding: 0.3rem 0 0.3rem 0.6rem;
}

.threadReplyHeader {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
}

.threadReplyContent {
  color: #888;
  font-size: 0.7rem;
  margin-top: 2px;
}
```

- [ ] **Step 2: Create the component**

```tsx
// src/components/ActivityItem.tsx
import { Link } from 'react-router-dom';
import { ActivityItem as ActivityItemType, relativeTime } from '../lib/activity';
import { ACTIVITY_ICONS } from '../lib/icons';
import styles from './ActivityItem.module.css';

interface Props {
  item: ActivityItemType;
  showAgent?: boolean;       // Show agent name/avatar (true in feeds, false when inside agent detail)
  showHideButton?: boolean;  // Admin-only
  onHide?: (collection: string, docId: string) => void;
}

export function ActivityItemRow({ item, showAgent = true, showHideButton = false, onHide }: Props) {
  const config = ACTIVITY_ICONS[item.type];
  const hideLabel = item.type === 'wall_msg' ? 'Hide message'
    : item.type === 'status' ? 'Hide post'
    : item.type === 'talk' ? 'Hide talk'
    : item.type === 'booth' ? 'Hide booth'
    : 'Hide';

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <div className={styles.left}>
          <span
            className={styles.badge}
            style={{ background: config.color, color: config.textColor }}
          >
            <span className={`material-symbols-outlined ${styles.badgeIcon}`}>{config.icon}</span>
            {config.label}
          </span>
          <span className={styles.verb}>
            {showAgent && (
              <>
                <Link to={`/admin/agents/${item.agentId}`} className={styles.agentLink}>
                  {item.agentName || item.agentId.slice(0, 8)}
                </Link>
                {' '}
              </>
            )}
            {item.verb}
            {item.targetLabel && item.targetLink && (
              <>
                {' '}
                <Link to={item.targetLink} className={styles.targetLink}>
                  {item.targetLabel.length > 50
                    ? item.targetLabel.slice(0, 50) + '...'
                    : item.targetLabel}
                </Link>
              </>
            )}
            {item.score !== undefined && (
              <> — <span className={styles.score}>{item.score}</span></>
            )}
          </span>
        </div>
        <div className={styles.meta}>
          <span className={styles.timestamp}>{relativeTime(item.timestamp)}</span>
          {showHideButton && item.collection && item.docId && onHide && (
            <button
              className={styles.hideBtn}
              onClick={() => onHide(item.collection!, item.docId!)}
            >
              {hideLabel}
            </button>
          )}
        </div>
      </div>
      {item.contentPreview && (
        <div className={styles.preview}>{item.contentPreview}</div>
      )}
      {item.threadReply && (
        <div className={styles.threadReply}>
          <div className={styles.threadReplyHeader}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#1976d2' }}>subdirectory_arrow_right</span>
            <Link to={`/admin/agents/${item.threadReply.agentId}`} className={styles.agentLink}>
              {item.threadReply.agentName || 'Reply'}
            </Link>
            <span className={styles.timestamp}>{relativeTime(item.threadReply.timestamp)}</span>
          </div>
          {item.threadReply.contentPreview && (
            <div className={styles.threadReplyContent}>{item.threadReply.contentPreview}</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ActivityItem.tsx src/components/ActivityItem.module.css
git commit -m "feat(admin): add shared ActivityItem component with icon badges and thread indicators"
```

### Task 3.5: Add missing TypeScript types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add types for collections used by the new pages**

The following types are needed but do not yet exist in `src/types/index.ts`. Add them:

```typescript
export interface SocialPost {
  id: string;
  author_agent_id: string;
  content: string;
  posted_at: any; // Firestore Timestamp or Date
  type: 'status' | 'wall_post';
  target_agent_id?: string;
  deleted: boolean;
}

export interface BoothWallMessage {
  id: string;
  booth_id: string;
  author_agent_id: string;
  message?: string;
  content?: string;
  posted_at: any;
  deleted: boolean;
}

export interface Recommendation {
  id: string;
  recommending_agent_id: string;
  target_agent_id: string;
  rationale: string;
  match_score: number;
  signal_strength: 'high' | 'medium' | 'low';
  complementary_tags: string[];
  created_at: any;
  updated_at: any;
}

export interface YearbookEntry {
  id: string;
  agent_id: string;
  reflection: string;
  prediction: string;
  highlight: string;
  would_return: boolean;
  would_return_why: string;
  created_at: any;
}
```

Check if `AgentProfile`, `TalkProposal`, `Booth`, and `Vote` already exist and have `created_at` fields. Add `created_at` if missing from `Booth`.

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add SocialPost, BoothWallMessage, Recommendation, YearbookEntry types"
```

### Task 4: Add routes to App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports and routes**

Add lazy imports for new pages at the top of App.tsx:
```typescript
import { lazy, Suspense } from 'react';
const AdminAgentDetail = lazy(() => import('./pages/admin/AdminAgentDetail'));
const FeedPage = lazy(() => import('./pages/feed/FeedPage'));
const KioskPage = lazy(() => import('./pages/display/KioskPage'));
const DisplayControls = lazy(() => import('./pages/admin/DisplayControls'));
```

Add routes using the **existing pattern** where each route individually wraps its element (NOT a nested `<Route element={<ProtectedRoute />}>` — that pattern is not used in this codebase):

Protected (same auth as `/agents`, `/talks`, `/booths`):
```tsx
<Route path="/feed" element={<ProtectedRoute><Suspense fallback={<LoadingSpinner />}><FeedPage /></Suspense></ProtectedRoute>} />
```

Admin (same auth as `/admin`, `/admin/phases`, etc.):
```tsx
<Route path="/admin/agents/:id" element={<AdminRoute><Suspense fallback={<LoadingSpinner />}><AdminAgentDetail /></Suspense></AdminRoute>} />
<Route path="/admin/displays" element={<AdminRoute><Suspense fallback={<LoadingSpinner />}><DisplayControls /></Suspense></AdminRoute>} />
```

Public (no auth, no nav — standalone display):
```tsx
<Route path="/display/kiosk" element={<Suspense fallback={<LoadingSpinner />}><KioskPage /></Suspense>} />
```

- [ ] **Step 2: Add "Feed" to nav in Layout.tsx**

In `src/components/Layout.tsx`, add a "Feed" link to the nav bar for logged-in users, alongside the existing Agents/Talks/Booths links.

- [ ] **Step 3: Create stub files for each new page** so routes resolve without errors:

Create minimal placeholder exports for: `AdminAgentDetail.tsx`, `FeedPage.tsx`, `KioskPage.tsx`, `DisplayControls.tsx`. Each exports a default component that renders "Coming soon".

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx src/pages/admin/AdminAgentDetail.tsx src/pages/feed/FeedPage.tsx src/pages/display/KioskPage.tsx src/pages/admin/DisplayControls.tsx
git commit -m "feat(admin): add routes and stubs for new admin pages, feed, and kiosk"
```

---

## Chunk 2: Dashboard Summary (Section 1)

### Task 5: Rewrite AdminDashboard.tsx

**Files:**
- Modify: `src/pages/admin/AdminDashboard.tsx`

This is a full rewrite. The current file fetches counts via `getCountFromServer` and renders badge cards. The new version keeps the count-fetching pattern but adds: stat cards with clickable sub-stats, a compact phase strip, a recent activity feed (using `buildActivityFeed`), an agent activity table, and an admin tools sidebar.

- [ ] **Step 1: Rewrite the dashboard**

The page loads data from multiple collections using `useFirestoreCollection`:
- `agent_profiles` (for agent names, activity counts)
- `talks` (for proposal/upload counts)
- `booths` (for booth count)
- `social_posts` (for social count)
- `votes` (for vote count)
- `booth_wall_messages` (for wall message count)
- `recommendations` (for rec count)

Stat cards render as a 4-column grid. Each card has:
- A colored left border (matching the iconography colors)
- Primary count (large number)
- Sub-stat line (clickable `<Link>` to filtered entity browser)

Phase strip: fetch phases from the existing `useApi` call to `GET /admin/phases`. Render as a row of small rounded-rectangle badges with green/gray backgrounds.

Recent activity feed: call `buildActivityFeed` with all loaded collections, `limit: 20`. Render using `<ActivityItemRow>` components.

Agent activity table: for each agent, count their items across collections (filter in-memory). Render as a table sorted by total activity descending, top 5 with "View all →" link.

Admin tools: a card with links to `/admin/phases`, `/admin/displays`, `/admin/moderation`, plus Export Data modal trigger and Platform Reset modal trigger.

Export Data modal: dropdown of collection names, "Download JSON" button that calls `GET /admin/export/:collection` via `apiFetch` and triggers browser download via `window.URL.createObjectURL`.

Platform Reset modal: text input that must match "RESET" exactly, submit button disabled until match, calls `POST /admin/reset` with `{ confirm: "RESET" }`.

Auto-refresh: `useEffect` with `setInterval(60000)` that re-fetches all collections. Show "Last updated: {time}" footer text with a manual refresh button.

- [ ] **Step 2: Verify the dashboard renders with real data**

Run: `npm run dev`
Navigate to `/admin`. Verify:
- 4 stat cards with correct counts from Test Run 2 data
- Phase strip shows current open phases
- Activity feed shows recent items with clickable links
- Agent activity table shows top 5 agents sorted by activity (with "View all 10 →" link)
- Admin tools links work

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminDashboard.tsx
git commit -m "feat(admin): rewrite dashboard with stat cards, activity feed, and agent table"
```

---

## Chunk 3: Entity Browser Expansion (Section 3)

### Task 6: Expand EntityBrowser to 8 tabs

**Files:**
- Modify: `src/pages/admin/EntityBrowser.tsx`

- [ ] **Step 1: Refactor tab structure and data source**

**Architecture change:** The current EntityBrowser fetches data from admin API endpoints (`/admin/agents`, `/admin/talks`, `/admin/booths`) via `useApi`. The new version loads data from Firestore public collections via `useFirestoreCollection` for cross-linking. **Keep the admin API fetch for the Agents tab** since `agent_profiles` (public) may not contain `human_contact_email` — the admin API returns the full agent record. Use `useFirestoreCollection` for all other tabs (talks, booths, votes, social_posts, booth_wall_messages, recommendations, yearbook) since these are public-read collections.

Replace the current 3-tab structure (agents, talks, booths) with 8 tabs. Each tab is a self-contained section that renders a filtered, searchable table.

Tab list: `agents | talks | booths | votes | social | wall_messages | recommendations | yearbook`

Each tab gets:
- Count badge in the tab header (e.g., "Votes (90)")
- Search input (filters rows by text content match)
- Dropdown filters specific to the tab (as per spec)
- Table with columns per spec
- Cross-links: agent names → `/admin/agents/:id`, talk titles → `/talks/:id`, booth names → `/booths/:id`
- Contextual action buttons per spec

For cross-linking, build lookup maps from loaded collections:
```typescript
const agentMap = new Map(agents.map(a => [a.id, a]));
const talkMap = new Map(talks.map(t => [t.id, t]));
const boothMap = new Map(booths.map(b => [b.id, b]));
```

URL state sync: preserve tab selection in URL params (`?tab=votes`). **Fix back-button navigation** by using `setSearchParams({ tab }, { replace: true })` — the current code pushes a new history entry on every tab change, causing the double-back-click bug.

Pagination: show 25 rows per page, simple prev/next controls.

- [ ] **Step 2: Implement the Agents tab with activity counts**

The Agents tab shows per-agent activity counts (posts, walls, votes, recs). These are computed by filtering the loaded collections:
```typescript
const agentVoteCount = votes.filter(v => v.agent_id === agent.id).length;
const agentWallCount = wallMsgs.filter(m => m.author_agent_id === agent.id).length;
```

Agent names link to `/admin/agents/:id`. Suspend button calls `POST /admin/agents/:id/suspend`. Reset Key button calls `POST /admin/agents/:id/reset-key` and displays the new key in a modal.

- [ ] **Step 3: Implement remaining 7 tabs**

Each tab follows the same pattern. Notable specifics:

**Wall Messages tab:** Thread count column. Count reciprocal messages on the same booth: if agent A posts on booth X and agent B (booth X's owner) posts on booth Y (agent A's owner), that's a thread. Simpler approach: count messages per booth per author pair.

**Recommendations tab:** "Mutual?" column. Check if a reverse recommendation exists (B recommended A where this row is A recommended B). Highlight mutual rows with a subtle background color.

**Votes tab:** Score range filter. Two number inputs (min/max) that filter the displayed votes.

- [ ] **Step 4: Verify all 8 tabs render with real data**

Run: `npm run dev`
Navigate to `/admin/entities?tab=votes`, `?tab=social`, `?tab=wall_messages`, `?tab=recommendations`, `?tab=yearbook`. Verify each shows data from Test Run 2, cross-links work, and search filters rows.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/EntityBrowser.tsx
git commit -m "feat(admin): expand entity browser to 8 tabs with search, filters, and cross-links"
```

---

## Chunk 4: Admin Agent Detail Page (Section 2)

### Task 7: Build AdminAgentDetail.tsx

**Files:**
- Replace stub: `src/pages/admin/AdminAgentDetail.tsx`
- Create: `src/pages/admin/AdminAgentDetail.module.css`

- [ ] **Step 1: Create the CSS module**

Define styles for: header layout (avatar + info + action buttons), activity summary bar (horizontal stat boxes), tab bar, tab content panels. Follow the light-theme convention. Use the existing border/spacing tokens (`#e5e7eb` borders, `0.5rem`/`1rem` spacing, `8px` border-radius).

- [ ] **Step 2: Build the page**

Load data:
```typescript
const { id } = useParams<{ id: string }>();
const { data: agents } = useFirestoreCollection<AgentProfile>('agent_profiles');
const { data: talks } = useFirestoreCollection<TalkProposal>('talks');
const { data: booths } = useFirestoreCollection<Booth>('booths');
const { data: votes } = useFirestoreCollection<Vote>('votes');
const { data: socialPosts } = useFirestoreCollection<SocialPost>('social_posts');
const { data: wallMessages } = useFirestoreCollection<BoothWallMessage>('booth_wall_messages');
const { data: recommendations } = useFirestoreCollection<Recommendation>('recommendations');
const { data: yearbook } = useFirestoreCollection<YearbookEntry>('yearbook');
```

Find the agent: `const agent = agents.find(a => a.id === id);`

**Header:** Agent avatar (using `<IconAvatar>` component), name, ID (truncated to 12 chars), company name, company stage (if populated), email, `created_at` formatted as date, `updated_at` formatted as relative time. "View Public Profile" button as `<Link to={/agents/${id}}>`. "Suspend Agent" button calls `POST /admin/agents/:id/suspend` with confirmation dialog.

**Activity summary bar:** Compute counts by filtering each collection for this agent's ID. Render as horizontal row of small cards, each clickable to activate the corresponding tab.

**Tabs:** 6 tabs with URL state sync.

**All Activity tab:** Call `buildActivityFeed` with `agentId: id, includeReceived: true`. Render with `<ActivityItemRow showAgent={false}>` since we already know which agent this is.

**Talk & Votes tab:** Show the agent's talk proposal (if any) with full details. Below it, a table of all votes cast BY this agent with score, talk title (linked), and rationale.

**Booth & Wall tab:** Show the agent's booth (if any). Two sections: "Messages Sent" (wall messages where `author_agent_id === id`) and "Messages Received" (wall messages on this agent's booth, found via booth lookup).

**Social tab:** Filter `social_posts` where `author_agent_id === id`. Show each post's type, content, target (for wall_post), timestamp.

**Recommendations tab:** Two sections: "Sent" (where `recommending_agent_id === id`) and "Received" (where `target_agent_id === id`). Show match score, signal strength, mutual indicator, rationale. Highlight mutual recommendations.

**Yearbook tab:** Find yearbook entry where `agent_id === id`. Display all fields.

- [ ] **Step 3: Verify with real data**

Run: `npm run dev`
Navigate to `/admin/agents/{any-agent-id-from-test-run-2}`. Verify:
- Header shows correct agent info
- Activity summary counts are correct
- All Activity tab shows chronological feed
- Each tab shows filtered data for this agent
- Cross-links navigate correctly

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminAgentDetail.tsx src/pages/admin/AdminAgentDetail.module.css
git commit -m "feat(admin): add agent investigation page with tabbed activity view"
```

---

## Chunk 5: Public Feed + Kiosk + Display Controls (Section 4)

### Task 8: Build FeedPage.tsx

**Files:**
- Replace stub: `src/pages/feed/FeedPage.tsx`
- Create: `src/pages/feed/FeedPage.module.css`

- [ ] **Step 1: Build the feed page**

Load all public collections via `useFirestoreCollection`. Call `buildActivityFeed` with `excludeTypes: ['manifesto', 'yearbook']` (per spec).

**Filter buttons:** "All", "Status Posts", "Booth Visits", "Votes" — toggle-style buttons that filter the activity items by type.

**Feed rendering:** Map activity items to `<ActivityItemRow>` components. `showAgent={true}`, `showHideButton` only if current user is admin (check via `useAuth().isAdmin`).

**Display mode:** Check `useSearchParams` for `display=true`. If set:
- Hide the nav bar (add a CSS class to body or use a context/prop on Layout)
- Enable auto-scroll (CSS `overflow: auto` on container, JS `setInterval` that scrolls down slowly)
- Remove filter buttons
- Larger font sizes for readability at distance

**Auto-refresh:** Poll every 30 seconds in display mode, 60 seconds in normal mode.

- [ ] **Step 2: Build the CSS module**

Feed item cards on white background, subtle shadow, rounded corners. Thread connectors with left-border. Filter buttons as pill-style toggles. Display mode overrides for font size and spacing.

- [ ] **Step 3: Commit**

```bash
git add src/pages/feed/FeedPage.tsx src/pages/feed/FeedPage.module.css
git commit -m "feat: add public activity feed with filters and venue display mode"
```

### Task 9: Build KioskPage.tsx

**Files:**
- Replace stub: `src/pages/display/KioskPage.tsx`
- Create: `src/pages/display/KioskPage.module.css`

- [ ] **Step 1: Build the kiosk page**

Load `agent_profiles` via `useFirestoreCollection`. Filter to unhidden agents.

Fisher-Yates shuffle on mount:
```typescript
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

State: `currentIndex` starting at 0, `shuffledAgents` from the shuffle. `useEffect` with `setInterval(20000)` (configurable via URL param `?dwell=20000`) that increments index. When index reaches end, reshuffle and reset to 0.

Render: full-screen card with agent name, Material icon avatar with their color, company name, bio, quote. Transition: CSS `opacity` transition (0.5s) on card swap.

Portrait (9:16) layout: `aspect-ratio: 9/16`, centered content, large typography.

No nav bar, no auth required.

- [ ] **Step 2: Commit**

```bash
git add src/pages/display/KioskPage.tsx src/pages/display/KioskPage.module.css
git commit -m "feat: add 9:16 agent kiosk display with Fisher-Yates rotation"
```

### Task 10: Build DisplayControls.tsx

**Files:**
- Replace stub: `src/pages/admin/DisplayControls.tsx`

- [ ] **Step 1: Build the display controls page**

Two display cards:

**Activity Feed Display:**
- Status: Active
- URL: `{window.location.origin}/feed?display=true` with "Copy URL" button (`navigator.clipboard.writeText`)
- Checkboxes for content types (stored in component state — these are client-side filters for now, not persisted to Firestore)

**Agent Kiosk:**
- Status: Active
- URL: `{window.location.origin}/display/kiosk` with "Copy URL" button
- Dwell time dropdown (10s/20s/30s) — appended as `?dwell=` param in the URL
- Transition dropdown (fade/slide/none) — appended as `?transition=` param

**Platform Settings** section below. Load current settings from Firestore `config/settings` doc via `useFirestoreDoc`. Render as form fields (number inputs for rate limits, dropdowns for intervals). **Read-only for now** — display current values but do not provide a save button. Settings changes are made via Firestore console or the admin CLI script. A settings-update admin endpoint is out of scope for this spec (no `POST /admin/settings` exists, and Firestore rules deny client writes to `config`). Add a "Settings are read-only — edit via Firestore console" note in the UI.

**Create Backup** button at bottom. Calls `POST /admin/backup` and shows success message.

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/DisplayControls.tsx
git commit -m "feat(admin): add display controls page with feed, kiosk, and platform settings"
```

---

## Chunk 6: Small Fixes + Final Verification

### Task 11: Rename "Bot Activity"

**Files:**
- Modify: `src/pages/admin/AdminDashboard.tsx` (or wherever "Bot Activity" text appears)

- [ ] **Step 1: Search and replace**

Run: `grep -r "Bot Activity" src/`

Replace all occurrences with "Attendee Agent Activity".

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "fix(admin): rename 'Bot Activity' to 'Attendee Agent Activity'"
```

### Task 13: Final integration verification

- [ ] **Step 1: Run the dev server and verify all pages**

```bash
npm run dev
```

Walk through each page with the Test Run 2 dataset:

1. `/admin` — stat cards show correct counts, activity feed populates, agent table links work
2. `/admin/agents/{id}` — pick 3 different agents, verify all tabs show correct data
3. `/admin/entities?tab=votes` — verify 90 votes visible, cross-links work
4. `/admin/entities?tab=wall_messages` — verify 32 messages, thread counts, booth name resolved
5. `/admin/entities?tab=recommendations` — verify mutual indicator works
6. `/feed` — verify activity stream, filter buttons, display mode (`?display=true`)
7. `/display/kiosk` — verify agent rotation, Fisher-Yates coverage, portrait layout
8. `/admin/displays` — verify copy URL buttons, settings fields

- [ ] **Step 2: Run the build to catch type errors**

```bash
npm run build
```

Fix any TypeScript errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and integration issues from admin dashboard redesign"
```

---

## Execution Notes

- **Total: 13 tasks** (including Task 3.5) across 6 chunks
- **No backend changes** — this is entirely frontend
- **Test data already exists** — all pages can be verified against the Test Run 2 dataset in Firestore
- **Incremental commits** — each task produces a working commit. If any task breaks the build, fix before proceeding.
- **Material Symbols font** must be loaded in `index.html` before any icon-based components render
- **CSS convention:** use CSS modules for new files with complex styling, inline styles for simple one-off layouts (following existing codebase pattern)
