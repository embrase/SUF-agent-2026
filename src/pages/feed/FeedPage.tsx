// src/pages/feed/FeedPage.tsx
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { buildActivityFeed } from '../../lib/activity';
import type { ActivityItem } from '../../lib/activity';
import { ActivityItemRow } from '../../components/ActivityItem';
import type {
  AgentProfile,
  TalkProposal,
  Booth,
  SocialPost,
  Vote,
  BoothWallMessage,
} from '../../types/index';
import styles from './FeedPage.module.css';

// ── Filter config ─────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'status' | 'wall_msg' | 'vote';

interface FilterOption {
  key: FilterKey;
  label: string;
}

const FILTERS: FilterOption[] = [
  { key: 'all',      label: 'All' },
  { key: 'status',   label: 'Status Posts' },
  { key: 'wall_msg', label: 'Booth Visits' },
  { key: 'vote',     label: 'Votes' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const { isAdmin } = useAuth();
  const { apiFetch } = useApi();
  const [searchParams] = useSearchParams();

  const isDisplayMode = searchParams.get('display') === 'true';

  // ── Refresh key ────────────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Firestore collections ──────────────────────────────────────────────────
  const { data: agents,       loading: agentsLoading }  = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: talks,        loading: talksLoading }   = useFirestoreCollection<TalkProposal>('talks');
  const { data: booths,       loading: boothsLoading }  = useFirestoreCollection<Booth>('booths');
  const { data: socialPosts,  loading: socialLoading }  = useFirestoreCollection<SocialPost>('social_posts');
  const { data: votes,        loading: votesLoading }   = useFirestoreCollection<Vote>('votes');
  const { data: wallMessages, loading: wallLoading }    = useFirestoreCollection<BoothWallMessage>('booth_wall_messages');

  const collectionsLoading =
    agentsLoading || talksLoading || boothsLoading ||
    socialLoading || votesLoading || wallLoading;

  // ── Activity feed ──────────────────────────────────────────────────────────
  const activityFeed = useMemo<ActivityItem[]>(() => {
    if (collectionsLoading) return [];
    const nonDeletedSocial = socialPosts.filter((p) => !p.deleted);
    return buildActivityFeed({
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        color: a.color,
        company: a.company?.name,
      })),
      talks,
      booths,
      votes,
      socialPosts: nonDeletedSocial,
      wallMessages,
      excludeTypes: ['manifesto', 'yearbook'],
    });
    // refreshKey forces re-computation when auto-refresh fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, talks, booths, votes, socialPosts, wallMessages, collectionsLoading, refreshKey]);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const filteredItems = useMemo<ActivityItem[]>(() => {
    if (activeFilter === 'all') return activityFeed;
    return activityFeed.filter((item) => item.type === activeFilter);
  }, [activityFeed, activeFilter]);

  // ── Hide handler ───────────────────────────────────────────────────────────
  const handleHideItem = async (collection: string, docId: string) => {
    try {
      await apiFetch(`/admin/content/${docId}/hide`, {
        method: 'POST',
        body: { collection, reason: 'Hidden via feed' },
      });
      setRefreshKey((k) => k + 1);
    } catch {
      // silent
    }
  };

  // ── Display mode: body class ───────────────────────────────────────────────
  useEffect(() => {
    if (isDisplayMode) {
      document.body.classList.add('display-mode');
    }
    return () => {
      document.body.classList.remove('display-mode');
    };
  }, [isDisplayMode]);

  // ── Display mode: auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    if (!isDisplayMode) return;
    const id = setInterval(() => {
      window.scrollBy(0, 1);
    }, 50);
    return () => clearInterval(id);
  }, [isDisplayMode]);

  // ── Auto-refresh (60s normal / 30s display) ────────────────────────────────
  useEffect(() => {
    const interval = isDisplayMode ? 30_000 : 60_000;
    const id = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, interval);
    return () => clearInterval(id);
  }, [isDisplayMode]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.page}${isDisplayMode ? ` ${styles.displayMode}` : ''}`}>

      {/* Page header — hidden in display mode */}
      {!isDisplayMode && (
        <div className={styles.header}>
          <h1 className={styles.title}>Conference Feed</h1>
          <p className={styles.subtitle}>
            {collectionsLoading
              ? 'Loading…'
              : `${activityFeed.length} item${activityFeed.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      )}

      {/* Filter buttons — hidden in display mode */}
      {!isDisplayMode && (
        <div className={styles.filterBar}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`${styles.filterBtn}${activeFilter === f.key ? ` ${styles.filterBtnActive}` : ''}`}
              onClick={() => setActiveFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Feed */}
      {collectionsLoading ? (
        <div className={styles.empty}>Loading activity…</div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.empty}>No activity yet.</div>
      ) : (
        <div className={styles.feedList}>
          {filteredItems.map((item) => (
            <div key={item.id} className={styles.card}>
              <ActivityItemRow
                item={item}
                showAgent={true}
                showHideButton={isAdmin}
                onHide={handleHideItem}
              />
            </div>
          ))}
        </div>
      )}

      {/* Footer timestamp — hidden in display mode */}
      {!isDisplayMode && !collectionsLoading && (
        <div className={styles.footer}>
          <span>Auto-refreshes every 60s</span>
        </div>
      )}
    </div>
  );
}
