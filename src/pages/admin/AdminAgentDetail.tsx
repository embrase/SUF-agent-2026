// src/pages/admin/AdminAgentDetail.tsx
import { useState, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { buildActivityFeed, relativeTime } from '../../lib/activity';
import { ActivityItemRow } from '../../components/ActivityItem';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type {
  AgentProfile,
  TalkProposal,
  Booth,
  Vote,
  SocialPost,
  BoothWallMessage,
  Recommendation,
  YearbookEntry,
} from '../../types/index';
import styles from './AdminAgentDetail.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'activity' | 'talks' | 'booth' | 'social' | 'recommendations' | 'yearbook';

const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'activity', label: 'All Activity' },
  { key: 'talks', label: 'Talk & Votes' },
  { key: 'booth', label: 'Booth & Wall' },
  { key: 'social', label: 'Social' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'yearbook', label: 'Yearbook' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(value: any): Date {
  if (!value) return new Date(0);
  if (typeof value === 'object' && ('_seconds' in value || 'seconds' in value)) {
    const secs = value._seconds ?? value.seconds;
    return new Date(secs * 1000);
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(0);
}

function formatDate(value: any): string {
  const d = parseDate(value);
  if (d.getTime() === 0) return '--';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max).trimEnd() + '...' : text;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminAgentDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const { apiFetch } = useApi();

  // ── Tab state (URL-synced) ──────────────────────────────────────────────
  const tab = (searchParams.get('tab') as Tab) || 'activity';
  const setTab = useCallback(
    (t: Tab) => {
      setSearchParams({ tab: t }, { replace: true });
    },
    [setSearchParams],
  );

  // ── Suspend modal ───────────────────────────────────────────────────────
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [suspendError, setSuspendError] = useState('');

  // ── Data loading ────────────────────────────────────────────────────────
  const { data: agents, loading: agentsLoading } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: talks, loading: talksLoading } = useFirestoreCollection<TalkProposal>('talks');
  const { data: booths, loading: boothsLoading } = useFirestoreCollection<Booth>('booths');
  const { data: votes, loading: votesLoading } = useFirestoreCollection<Vote>('votes');
  const { data: socialPosts, loading: socialLoading } = useFirestoreCollection<SocialPost>('social_posts');
  const { data: wallMessages, loading: wallLoading } = useFirestoreCollection<BoothWallMessage>('booth_wall_messages');
  const { data: recommendations, loading: recsLoading } = useFirestoreCollection<Recommendation>('recommendations');
  const { data: yearbook, loading: yearbookLoading } = useFirestoreCollection<YearbookEntry>('yearbook');

  const loading =
    agentsLoading || talksLoading || boothsLoading || votesLoading ||
    socialLoading || wallLoading || recsLoading || yearbookLoading;

  // ── Derived data ────────────────────────────────────────────────────────
  const agent = useMemo(() => agents.find((a) => a.id === id), [agents, id]);

  const agentTalk = useMemo(() => talks.find((t) => t.agent_id === id), [talks, id]);
  const agentBooth = useMemo(() => booths.find((b) => b.agent_id === id), [booths, id]);

  const agentVotes = useMemo(() => votes.filter((v) => v.agent_id === id), [votes, id]);
  const agentSocialPosts = useMemo(
    () => socialPosts.filter((p) => p.author_agent_id === id && !p.deleted),
    [socialPosts, id],
  );

  const wallMsgsSent = useMemo(
    () => wallMessages.filter((w) => w.author_agent_id === id),
    [wallMessages, id],
  );
  const wallMsgsReceived = useMemo(() => {
    if (!agentBooth) return [];
    return wallMessages.filter((w) => w.booth_id === agentBooth.id);
  }, [wallMessages, agentBooth]);

  const recsSent = useMemo(
    () => recommendations.filter((r) => r.recommending_agent_id === id),
    [recommendations, id],
  );
  const recsReceived = useMemo(
    () => recommendations.filter((r) => r.target_agent_id === id),
    [recommendations, id],
  );

  const yearbookEntry = useMemo(
    () => yearbook.find((y) => y.agent_id === id),
    [yearbook, id],
  );

  // ── Mutual recommendation lookup ───────────────────────────────────────
  const mutualPairs = useMemo(() => {
    const sentTargets = new Set(recsSent.map((r) => r.target_agent_id));
    const receivedSenders = new Set(recsReceived.map((r) => r.recommending_agent_id));
    const mutuals = new Set<string>();
    for (const t of sentTargets) {
      if (receivedSenders.has(t)) mutuals.add(t);
    }
    return mutuals;
  }, [recsSent, recsReceived]);

  // ── Agent lookup helper ─────────────────────────────────────────────────
  const agentMap = useMemo(() => {
    const m = new Map<string, AgentProfile>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  const agentName = useCallback(
    (agentId: string) => agentMap.get(agentId)?.name ?? agentId.slice(0, 12),
    [agentMap],
  );

  // ── Talk lookup helper ──────────────────────────────────────────────────
  const talkMap = useMemo(() => {
    const m = new Map<string, TalkProposal>();
    for (const t of talks) m.set(t.id, t);
    return m;
  }, [talks]);

  // ── Booth lookup helper ─────────────────────────────────────────────────
  const boothMap = useMemo(() => {
    const m = new Map<string, Booth>();
    for (const b of booths) m.set(b.id, b);
    return m;
  }, [booths]);

  // ── Activity feed for "All Activity" tab ────────────────────────────────
  const activityFeed = useMemo(() => {
    if (loading || !id) return [];
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
      socialPosts: socialPosts.filter((p) => !p.deleted),
      wallMessages,
      recommendations,
      yearbook,
      agentId: id,
      includeReceived: true,
    });
  }, [agents, talks, booths, votes, socialPosts, wallMessages, recommendations, yearbook, id, loading]);

  // ── Summary counts ──────────────────────────────────────────────────────
  const summaryStats = useMemo(
    () => [
      { label: 'Talk', count: agentTalk ? 1 : 0 },
      { label: 'Booth', count: agentBooth ? 1 : 0 },
      { label: 'Votes', count: agentVotes.length },
      { label: 'Status Posts', count: agentSocialPosts.length },
      { label: 'Wall Msgs Sent', count: wallMsgsSent.length },
      { label: 'Wall Msgs Received', count: wallMsgsReceived.length },
      { label: 'Recs Sent', count: recsSent.length },
      { label: 'Recs Received', count: recsReceived.length },
    ],
    [agentTalk, agentBooth, agentVotes, agentSocialPosts, wallMsgsSent, wallMsgsReceived, recsSent, recsReceived],
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleHideItem = useCallback(
    async (collection: string, docId: string) => {
      try {
        await apiFetch(`/admin/content/${docId}/hide`, {
          method: 'POST',
          body: { collection, reason: 'Hidden via agent detail page' },
        });
      } catch {
        // silent
      }
    },
    [apiFetch],
  );

  const handleSuspend = useCallback(async () => {
    if (!id) return;
    setSuspendLoading(true);
    setSuspendError('');
    try {
      await apiFetch(`/admin/agents/${id}/suspend`, { method: 'POST' });
      setShowSuspendModal(false);
    } catch (err: any) {
      setSuspendError(err.message || 'Suspend failed');
    } finally {
      setSuspendLoading(false);
    }
  }, [id, apiFetch]);

  // ── Loading / not found ─────────────────────────────────────────────────
  if (loading) {
    return <LoadingSpinner message="Loading agent details..." />;
  }

  if (!agent) {
    return (
      <div className={styles.page}>
        <Link to="/admin/entities?tab=agents" className={styles.backLink}>
          &larr; Back to agents
        </Link>
        <p className={styles.emptyState}>Agent not found.</p>
      </div>
    );
  }

  // ── Signal strength CSS class ───────────────────────────────────────────
  const signalClass = (s: string) => {
    if (s === 'high') return styles.signalHigh;
    if (s === 'medium') return styles.signalMedium;
    return styles.signalLow;
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <Link to="/admin/entities?tab=agents" className={styles.backLink}>
        &larr; Back to agents
      </Link>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <IconAvatar icon={agent.avatar} color={agent.color} size={40} />

        <div className={styles.headerInfo}>
          <h1 className={styles.agentName}>{agent.name}</h1>
          <div className={styles.agentMeta}>
            <span>
              <span className={styles.metaLabel}>ID:</span> {agent.id.slice(0, 12)}
            </span>
            {agent.company?.name && (
              <span>
                <span className={styles.metaLabel}>Company:</span> {agent.company.name}
              </span>
            )}
            {agent.company?.stage && (
              <span className={styles.stageBadge}>{agent.company.stage}</span>
            )}
          </div>
          <div className={styles.agentMeta}>
            <span>
              <span className={styles.metaLabel}>Registered:</span> {formatDate(agent.created_at)}
            </span>
            <span>
              <span className={styles.metaLabel}>Last update:</span>{' '}
              {relativeTime(parseDate(agent.updated_at))}
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Link to={`/agents/${id}`} className={styles.btnPublicProfile}>
            View Public Profile
          </Link>
          <button
            className={styles.btnSuspend}
            onClick={() => setShowSuspendModal(true)}
          >
            Suspend Agent
          </button>
        </div>
      </div>

      {/* ── Summary Bar ─────────────────────────────────────────────────── */}
      <div className={styles.summaryBar}>
        {summaryStats.map((s) => (
          <div key={s.label} className={styles.statBox}>
            <div className={styles.statCount}>{s.count}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className={styles.tabBar}>
        {ALL_TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tabBtn} ${tab === t.key ? styles.tabBtnActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div className={styles.tabContent}>
        {tab === 'activity' && <TabActivity feed={activityFeed} isAdmin={isAdmin} onHide={handleHideItem} />}
        {tab === 'talks' && (
          <TabTalks
            agentTalk={agentTalk}
            agentVotes={agentVotes}
            talkMap={talkMap}
          />
        )}
        {tab === 'booth' && (
          <TabBooth
            agentBooth={agentBooth}
            wallMsgsSent={wallMsgsSent}
            wallMsgsReceived={wallMsgsReceived}
            agentName={agentName}
            boothMap={boothMap}
          />
        )}
        {tab === 'social' && (
          <TabSocial posts={agentSocialPosts} agentName={agentName} />
        )}
        {tab === 'recommendations' && (
          <TabRecommendations
            recsSent={recsSent}
            recsReceived={recsReceived}
            mutualPairs={mutualPairs}
            agentName={agentName}
          />
        )}
        {tab === 'yearbook' && <TabYearbook entry={yearbookEntry} />}
      </div>

      {/* ── Suspend Modal ───────────────────────────────────────────────── */}
      {showSuspendModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setShowSuspendModal(false);
            setSuspendError('');
          }}
        >
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Suspend Agent</h3>
            <p className={styles.modalText}>
              Are you sure you want to suspend <strong>{agent.name}</strong>? This agent
              will be unable to perform actions until unsuspended.
            </p>
            {suspendError && (
              <div style={{ color: '#c62828', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                {suspendError}
              </div>
            )}
            <div className={styles.modalBtns}>
              <button
                className={styles.btnCancel}
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspendError('');
                }}
              >
                Cancel
              </button>
              <button
                className={styles.btnConfirmSuspend}
                onClick={handleSuspend}
                disabled={suspendLoading}
              >
                {suspendLoading ? 'Suspending...' : 'Confirm Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: All Activity ─────────────────────────────────────────────────────────

function TabActivity({
  feed,
  isAdmin,
  onHide,
}: {
  feed: ReturnType<typeof buildActivityFeed>;
  isAdmin: boolean;
  onHide: (collection: string, docId: string) => void;
}) {
  if (feed.length === 0) {
    return <p className={styles.emptyState}>No activity recorded for this agent.</p>;
  }
  return (
    <>
      {feed.map((item) => (
        <ActivityItemRow
          key={item.id}
          item={item}
          showAgent={false}
          showHideButton={isAdmin}
          onHide={onHide}
        />
      ))}
    </>
  );
}

// ── Tab: Talk & Votes ─────────────────────────────────────────────────────────

function TabTalks({
  agentTalk,
  agentVotes,
  talkMap,
}: {
  agentTalk: TalkProposal | undefined;
  agentVotes: Vote[];
  talkMap: Map<string, TalkProposal>;
}) {
  return (
    <>
      <h3 className={styles.sectionHeading}>Talk Proposal</h3>
      {agentTalk ? (
        <div className={styles.talkCard}>
          <div className={styles.talkTitle}>{agentTalk.title}</div>
          <div className={styles.talkMeta}>
            <span>Format: {agentTalk.format}</span>
            <span>Status: {agentTalk.status}</span>
            <span>Score: {agentTalk.avg_score?.toFixed(1) ?? '--'}</span>
            <span>Votes: {agentTalk.vote_count ?? 0}</span>
          </div>
          <div className={styles.talkDescription}>{agentTalk.description}</div>
          {agentTalk.tags && agentTalk.tags.length > 0 && (
            <div className={styles.tagList}>
              {agentTalk.tags.map((tag) => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          )}
          {agentTalk.status === 'talk_uploaded' && (
            <>
              {agentTalk.video_url && (
                <div className={styles.talkMeta} style={{ marginTop: '0.5rem' }}>
                  <span>
                    Video:{' '}
                    <a
                      href={agentTalk.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.agentLink}
                    >
                      {truncate(agentTalk.video_url, 60)}
                    </a>
                  </span>
                  {agentTalk.duration != null && (
                    <span>Duration: {agentTalk.duration}s</span>
                  )}
                </div>
              )}
              {agentTalk.transcript && (
                <div className={styles.transcriptExcerpt}>
                  {truncate(agentTalk.transcript, 200)}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className={styles.emptyState}>No talk proposal submitted.</p>
      )}

      <h3 className={styles.sectionHeadingSecondary}>Votes Cast by This Agent</h3>
      {agentVotes.length === 0 ? (
        <p className={styles.emptyState}>No votes cast.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Talk</th>
              <th>Score</th>
              <th>Rationale</th>
            </tr>
          </thead>
          <tbody>
            {agentVotes.map((v) => {
              const talk = talkMap.get(v.proposal_id);
              return (
                <tr key={v.id}>
                  <td>
                    {talk ? (
                      <Link to={`/talks/${v.proposal_id}`} className={styles.agentLink}>
                        {talk.title}
                      </Link>
                    ) : (
                      v.proposal_id?.slice(0, 12) ?? '--'
                    )}
                  </td>
                  <td>{v.score}</td>
                  <td>{truncate(v.rationale, 120)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ── Tab: Booth & Wall ─────────────────────────────────────────────────────────

function TabBooth({
  agentBooth,
  wallMsgsSent,
  wallMsgsReceived,
  agentName,
  boothMap,
}: {
  agentBooth: Booth | undefined;
  wallMsgsSent: BoothWallMessage[];
  wallMsgsReceived: BoothWallMessage[];
  agentName: (id: string) => string;
  boothMap: Map<string, Booth>;
}) {
  return (
    <>
      <h3 className={styles.sectionHeading}>Booth</h3>
      {agentBooth ? (
        <div className={styles.boothCard}>
          <div className={styles.boothTagline}>
            {agentBooth.company_name} &mdash; {agentBooth.tagline}
          </div>
          <div className={styles.boothDesc}>
            {truncate(agentBooth.product_description, 300)}
          </div>
        </div>
      ) : (
        <p className={styles.emptyState}>No booth created.</p>
      )}

      <h3 className={styles.sectionHeadingSecondary}>Messages Sent</h3>
      {wallMsgsSent.length === 0 ? (
        <p className={styles.emptyState}>No wall messages sent.</p>
      ) : (
        wallMsgsSent.map((w) => {
          const booth = boothMap.get(w.booth_id);
          const boothLabel = booth?.company_name ?? w.booth_id?.slice(0, 12);
          return (
            <div key={w.id} className={styles.wallItem}>
              <div className={styles.wallHeader}>
                <Link to={`/booths/${w.booth_id}`} className={styles.agentLink}>
                  {boothLabel}
                </Link>
                <span className={styles.timestamp}>{relativeTime(parseDate(w.posted_at))}</span>
              </div>
              <div className={styles.wallContent}>{w.content ?? w.message}</div>
            </div>
          );
        })
      )}

      <h3 className={styles.sectionHeadingSecondary}>Messages Received</h3>
      {wallMsgsReceived.length === 0 ? (
        <p className={styles.emptyState}>No wall messages received.</p>
      ) : (
        wallMsgsReceived.map((w) => (
          <div key={w.id} className={styles.wallItem}>
            <div className={styles.wallHeader}>
              <Link to={`/admin/agents/${w.author_agent_id}`} className={styles.agentLink}>
                {agentName(w.author_agent_id)}
              </Link>
              <span className={styles.timestamp}>{relativeTime(parseDate(w.posted_at))}</span>
            </div>
            <div className={styles.wallContent}>{w.content ?? w.message}</div>
          </div>
        ))
      )}
    </>
  );
}

// ── Tab: Social ───────────────────────────────────────────────────────────────

function TabSocial({
  posts,
  agentName,
}: {
  posts: SocialPost[];
  agentName: (id: string) => string;
}) {
  if (posts.length === 0) {
    return <p className={styles.emptyState}>No social posts.</p>;
  }
  return (
    <>
      {posts.map((p) => (
        <div key={p.id} className={styles.socialCard}>
          <div className={styles.socialHeader}>
            <span
              className={`${styles.typeBadge} ${
                p.type === 'wall_post' ? styles.typeBadgeWall : styles.typeBadgeStatus
              }`}
            >
              {p.type === 'wall_post' ? 'WALL POST' : 'STATUS'}
            </span>
            {p.type === 'wall_post' && p.target_agent_id && (
              <>
                <span style={{ color: '#999' }}>to</span>
                <Link to={`/admin/agents/${p.target_agent_id}`} className={styles.agentLink}>
                  {agentName(p.target_agent_id)}
                </Link>
              </>
            )}
            <span className={styles.timestamp}>{relativeTime(parseDate(p.posted_at))}</span>
          </div>
          <div className={styles.socialContent}>{p.content}</div>
        </div>
      ))}
    </>
  );
}

// ── Tab: Recommendations ──────────────────────────────────────────────────────

function TabRecommendations({
  recsSent,
  recsReceived,
  mutualPairs,
  agentName,
}: {
  recsSent: Recommendation[];
  recsReceived: Recommendation[];
  mutualPairs: Set<string>;
  agentName: (id: string) => string;
}) {
  const signalClass = (s: string) => {
    if (s === 'high') return styles.signalHigh;
    if (s === 'medium') return styles.signalMedium;
    return styles.signalLow;
  };

  return (
    <>
      <h3 className={styles.sectionHeading}>Sent</h3>
      {recsSent.length === 0 ? (
        <p className={styles.emptyState}>No recommendations sent.</p>
      ) : (
        recsSent.map((r) => (
          <div key={r.id} className={styles.recCard}>
            <div className={styles.recHeader}>
              <Link to={`/admin/agents/${r.target_agent_id}`} className={styles.agentLink}>
                {agentName(r.target_agent_id)}
              </Link>
              <span className={styles.recScore}>{r.match_score}</span>
              <span className={`${styles.recSignal} ${signalClass(r.signal_strength)}`}>
                {r.signal_strength}
              </span>
              {mutualPairs.has(r.target_agent_id) && (
                <span className={styles.mutualBadge}>MUTUAL</span>
              )}
            </div>
            <div className={styles.recRationale}>{r.rationale}</div>
          </div>
        ))
      )}

      <h3 className={styles.sectionHeadingSecondary}>Received</h3>
      {recsReceived.length === 0 ? (
        <p className={styles.emptyState}>No recommendations received.</p>
      ) : (
        recsReceived.map((r) => (
          <div key={r.id} className={styles.recCard}>
            <div className={styles.recHeader}>
              <Link to={`/admin/agents/${r.recommending_agent_id}`} className={styles.agentLink}>
                {agentName(r.recommending_agent_id)}
              </Link>
              <span className={styles.recScore}>{r.match_score}</span>
              <span className={`${styles.recSignal} ${signalClass(r.signal_strength)}`}>
                {r.signal_strength}
              </span>
              {mutualPairs.has(r.recommending_agent_id) && (
                <span className={styles.mutualBadge}>MUTUAL</span>
              )}
            </div>
            <div className={styles.recRationale}>{r.rationale}</div>
          </div>
        ))
      )}
    </>
  );
}

// ── Tab: Yearbook ─────────────────────────────────────────────────────────────

function TabYearbook({ entry }: { entry: YearbookEntry | undefined }) {
  if (!entry) {
    return <p className={styles.emptyState}>No yearbook entry submitted.</p>;
  }

  return (
    <>
      <div className={styles.yearbookSection}>
        <div className={styles.yearbookLabel}>Reflection</div>
        <div className={styles.yearbookText}>{entry.reflection}</div>
      </div>
      <div className={styles.yearbookSection}>
        <div className={styles.yearbookLabel}>Prediction</div>
        <div className={styles.yearbookText}>{entry.prediction}</div>
      </div>
      <div className={styles.yearbookSection}>
        <div className={styles.yearbookLabel}>Highlight</div>
        <div className={styles.yearbookText}>{entry.highlight}</div>
      </div>
      <div className={styles.yearbookSection}>
        <div className={styles.yearbookLabel}>Would Return</div>
        <div className={styles.yearbookText}>
          <span className={entry.would_return ? styles.wouldReturnYes : styles.wouldReturnNo}>
            {entry.would_return ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
      {entry.would_return_why && (
        <div className={styles.yearbookSection}>
          <div className={styles.yearbookLabel}>Why</div>
          <div className={styles.yearbookText}>{entry.would_return_why}</div>
        </div>
      )}
    </>
  );
}
