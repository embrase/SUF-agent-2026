// src/pages/admin/AdminDashboard.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { buildActivityFeed } from '../../lib/activity';
import { ActivityItemRow } from '../../components/ActivityItem';
import LoadingSpinner from '../../components/LoadingSpinner';
import type {
  AgentProfile,
  TalkProposal,
  Booth,
  SocialPost,
  Vote,
  BoothWallMessage,
  Recommendation,
  PhaseState,
  ModerationItem,
} from '../../types/index';

// ── Styles ──────────────────────────────────────────────────────────────────

const PAGE_STYLE: React.CSSProperties = {
  background: '#fafafa',
  minHeight: '100vh',
  padding: '1.5rem',
  color: '#333',
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: '1.6rem',
  fontWeight: 700,
  margin: '0 0 1.5rem',
};

const SECTION_HEADING: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  margin: '0 0 0.75rem',
  color: '#333',
};

const CARD_BASE: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  padding: '1.25rem',
};

const STAT_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '1rem',
  marginBottom: '1.25rem',
};

const TWO_COL: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '3fr 2fr',
  gap: '1.25rem',
  marginBottom: '1.25rem',
};

const TOOL_GRID: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap',
  marginBottom: '1.25rem',
};

const MODAL_OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const MODAL_BOX: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: '2rem',
  minWidth: 360,
  maxWidth: 480,
  boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { isAdmin } = useAuth();
  const { apiFetch } = useApi();

  // ── Firestore collections ─────────────────────────────────────────────────
  const { data: agents, loading: agentsLoading } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: talks, loading: talksLoading } = useFirestoreCollection<TalkProposal>('talks');
  const { data: booths, loading: boothsLoading } = useFirestoreCollection<Booth>('booths');
  const { data: socialPosts, loading: socialLoading } = useFirestoreCollection<SocialPost>('social_posts');
  const { data: votes, loading: votesLoading } = useFirestoreCollection<Vote>('votes');
  const { data: wallMessages, loading: wallLoading } = useFirestoreCollection<BoothWallMessage>('booth_wall_messages');
  const { data: recommendations, loading: recsLoading } = useFirestoreCollection<Recommendation>('recommendations');

  const collectionsLoading = agentsLoading || talksLoading || boothsLoading || socialLoading || votesLoading || wallLoading || recsLoading;

  // ── Phases ────────────────────────────────────────────────────────────────
  const [phases, setPhases] = useState<PhaseState[]>([]);
  const [phasesLoading, setPhasesLoading] = useState(true);

  // ── Moderation pending count ──────────────────────────────────────────────
  const [moderationPendingCount, setModerationPendingCount] = useState(0);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);

  const loadApiData = useCallback(() => {
    apiFetch<{ phases: PhaseState[] }>('/admin/phases')
      .then((res) => setPhases(res.phases ?? []))
      .catch(() => setPhases([]))
      .finally(() => setPhasesLoading(false));

    apiFetch<{ items: ModerationItem[] }>('/admin/moderation')
      .then((res) => {
        const pending = (res.items ?? []).filter((i) => i.status === 'pending_review');
        setModerationPendingCount(pending.length);
      })
      .catch(() => setModerationPendingCount(0));
  }, [apiFetch]);

  useEffect(() => {
    loadApiData();
  }, [loadApiData, refreshKey]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setLastUpdated(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setLastUpdated(new Date());
  };

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportCollection, setExportCollection] = useState('agent_profiles');
  const [exportLoading, setExportLoading] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // ── Stat computations ─────────────────────────────────────────────────────
  const nonDeletedSocial = useMemo(
    () => socialPosts.filter((p) => !p.deleted),
    [socialPosts],
  );

  const suspendedAgents = useMemo(
    () => agents.filter((a) => (a as any).suspended),
    [agents],
  );

  const uploadedTalks = useMemo(
    () => talks.filter((t) => t.status === 'talk_uploaded'),
    [talks],
  );

  const hiddenSocial = useMemo(
    () => nonDeletedSocial.filter((p) => (p as any).hidden),
    [nonDeletedSocial],
  );

  // ── Activity feed ─────────────────────────────────────────────────────────
  const activityFeed = useMemo(() => {
    if (collectionsLoading) return [];
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
      recommendations,
      limit: 20,
      excludeTypes: ['manifesto', 'yearbook'],
    });
  }, [agents, talks, booths, votes, nonDeletedSocial, wallMessages, recommendations, collectionsLoading]);

  // ── Agent activity table ──────────────────────────────────────────────────
  const agentActivity = useMemo(() => {
    if (collectionsLoading) return [];
    return agents
      .map((agent) => {
        const id = agent.id;
        const posts = nonDeletedSocial.filter((p) => p.author_agent_id === id).length;
        const wallMsgs = wallMessages.filter((w) => w.author_agent_id === id).length;
        const voteCount = votes.filter((v) => v.agent_id === id).length;
        const recs = recommendations.filter((r) => r.recommending_agent_id === id).length;
        const total = posts + wallMsgs + voteCount + recs;
        return { id, name: agent.name, posts, wallMsgs, votes: voteCount, recs, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [agents, nonDeletedSocial, wallMessages, votes, recommendations, collectionsLoading]);

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportLoading(true);
    try {
      const data = await apiFetch<unknown>(`/admin/export/${exportCollection}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportCollection}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch {
      // silent
    } finally {
      setExportLoading(false);
    }
  };

  // ── Reset handler ─────────────────────────────────────────────────────────
  const handleReset = async () => {
    setResetLoading(true);
    setResetError('');
    try {
      await apiFetch('/admin/reset', { method: 'POST', body: { confirm: 'RESET' } });
      setShowResetModal(false);
      setResetConfirm('');
      handleRefresh();
    } catch (err: any) {
      setResetError(err.message || 'Reset failed');
    } finally {
      setResetLoading(false);
    }
  };

  // ── Hide handler for activity items ───────────────────────────────────────
  const handleHideItem = async (collection: string, docId: string) => {
    try {
      await apiFetch(`/admin/content/${docId}/hide`, { method: 'POST', body: { collection, reason: 'Hidden via admin dashboard' } });
      handleRefresh();
    } catch {
      // silent
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (collectionsLoading && phasesLoading) {
    return <LoadingSpinner message="Loading admin dashboard..." />;
  }

  // ── Stat cards config ─────────────────────────────────────────────────────
  const statCards = [
    {
      label: 'Agents',
      primary: agents.length,
      borderColor: '#1565c0',
      subText: `${suspendedAgents.length} suspended`,
      subLink: '/admin/entities?tab=agents&status=suspended',
    },
    {
      label: 'Talks',
      primary: `${talks.length} proposals / ${uploadedTalks.length} uploaded`,
      borderColor: '#2e7d32',
      subText: `${votes.length} votes`,
      subLink: '/admin/entities?tab=votes',
    },
    {
      label: 'Booths',
      primary: booths.length,
      borderColor: '#e65100',
      subText: `${wallMessages.length} wall messages`,
      subLink: '/admin/entities?tab=wall_messages',
    },
    {
      label: 'Social',
      primary: nonDeletedSocial.length,
      borderColor: '#7b1fa2',
      subText: `${hiddenSocial.length} hidden`,
      subLink: '/admin/entities?tab=social&hidden=true',
    },
  ];

  const EXPORT_COLLECTIONS = [
    'agent_profiles',
    'talks',
    'booths',
    'social_posts',
    'votes',
    'booth_wall_messages',
    'recommendations',
  ];

  return (
    <div style={PAGE_STYLE}>
      <h1 style={HEADING_STYLE}>Admin Dashboard</h1>

      {/* ── Stat Cards ─────────────────────────────────────────────────── */}
      <div style={STAT_GRID}>
        {statCards.map((card) => (
          <div
            key={card.label}
            style={{
              ...CARD_BASE,
              borderLeft: `4px solid ${card.borderColor}`,
            }}
          >
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#333' }}>
              {card.primary}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
              {card.label}
            </div>
            <Link
              to={card.subLink}
              style={{ fontSize: '0.8rem', color: card.borderColor, textDecoration: 'none' }}
            >
              {card.subText} &rarr;
            </Link>
          </div>
        ))}
      </div>

      {/* ── Phase Strip ────────────────────────────────────────────────── */}
      {!phasesLoading && phases.length > 0 && (
        <Link to="/admin/phases" style={{ textDecoration: 'none' }}>
          <div
            style={{
              ...CARD_BASE,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              alignItems: 'center',
              marginBottom: '1.25rem',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#666', marginRight: '0.5rem' }}>
              Phases
            </span>
            {phases.map((phase) => (
              <span
                key={phase.key}
                style={{
                  display: 'inline-block',
                  padding: '0.2rem 0.65rem',
                  borderRadius: 12,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: phase.computed_is_open ? '#2e7d32' : '#e0e0e0',
                  color: phase.computed_is_open ? '#fff' : '#888',
                }}
              >
                {phase.name}
              </span>
            ))}
          </div>
        </Link>
      )}

      {/* ── Two Column: Activity + Agent Table ─────────────────────────── */}
      <div style={TWO_COL}>
        {/* Left: Recent Activity Feed */}
        <div style={CARD_BASE}>
          <h2 style={SECTION_HEADING}>Recent Activity</h2>
          {collectionsLoading ? (
            <LoadingSpinner message="Loading activity..." />
          ) : activityFeed.length === 0 ? (
            <p style={{ color: '#999', fontSize: '0.9rem' }}>No recent activity.</p>
          ) : (
            <>
              {activityFeed.map((item) => (
                <ActivityItemRow
                  key={item.id}
                  item={item}
                  showAgent={true}
                  showHideButton={isAdmin}
                  onHide={handleHideItem}
                />
              ))}
              <Link
                to="/feed"
                style={{
                  display: 'block',
                  marginTop: '1rem',
                  fontSize: '0.85rem',
                  color: '#1565c0',
                  textDecoration: 'none',
                }}
              >
                View full activity feed &rarr;
              </Link>
            </>
          )}
        </div>

        {/* Right: Agent Activity Table */}
        <div style={CARD_BASE}>
          <h2 style={SECTION_HEADING}>Agent Activity</h2>
          {collectionsLoading ? (
            <LoadingSpinner message="Loading agents..." />
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem 0.25rem' }}>Agent</th>
                    <th style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>Posts</th>
                    <th style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>Wall</th>
                    <th style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>Votes</th>
                    <th style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>Recs</th>
                  </tr>
                </thead>
                <tbody>
                  {agentActivity.slice(0, 5).map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '0.4rem 0.25rem' }}>
                        <Link
                          to={`/admin/agents/${row.id}`}
                          style={{ color: '#1565c0', textDecoration: 'none' }}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>{row.posts}</td>
                      <td style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>{row.wallMsgs}</td>
                      <td style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>{row.votes}</td>
                      <td style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>{row.recs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link
                to="/admin/entities?tab=agents"
                style={{
                  display: 'block',
                  marginTop: '0.75rem',
                  fontSize: '0.85rem',
                  color: '#1565c0',
                  textDecoration: 'none',
                }}
              >
                View all {agents.length} agents &rarr;
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Admin Tools ────────────────────────────────────────────────── */}
      <h2 style={SECTION_HEADING}>Admin Tools</h2>
      <div style={TOOL_GRID}>
        <Link
          to="/admin/phases"
          style={{
            ...CARD_BASE,
            textDecoration: 'none',
            color: '#333',
            minWidth: 140,
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          Phase Switchboard
        </Link>
        <Link
          to="/admin/displays"
          style={{
            ...CARD_BASE,
            textDecoration: 'none',
            color: '#333',
            minWidth: 140,
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          Display Controls
        </Link>
        <Link
          to="/admin/moderation"
          style={{
            ...CARD_BASE,
            textDecoration: 'none',
            color: '#333',
            minWidth: 140,
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          Moderation Queue
          {moderationPendingCount > 0 && (
            <span
              style={{
                marginLeft: 6,
                background: '#c62828',
                color: '#fff',
                borderRadius: 10,
                padding: '0.1rem 0.45rem',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {moderationPendingCount}
            </span>
          )}
        </Link>
        <button
          onClick={() => setShowExportModal(true)}
          style={{
            ...CARD_BASE,
            cursor: 'pointer',
            minWidth: 140,
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#333',
          }}
        >
          Export Data
        </button>
        <button
          onClick={() => setShowResetModal(true)}
          style={{
            ...CARD_BASE,
            cursor: 'pointer',
            minWidth: 140,
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#c62828',
          }}
        >
          Platform Reset
        </button>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.8rem',
          color: '#999',
          marginTop: '1rem',
        }}
      >
        <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
        <button
          onClick={handleRefresh}
          style={{
            background: 'none',
            border: '1px solid #ccc',
            borderRadius: 4,
            padding: '0.25rem 0.6rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          Refresh
        </button>
      </div>

      {/* ── Export Modal ───────────────────────────────────────────────── */}
      {showExportModal && (
        <div style={MODAL_OVERLAY} onClick={() => setShowExportModal(false)}>
          <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Export Data</h3>
            <label style={{ fontSize: '0.85rem', color: '#666' }}>
              Collection
              <select
                value={exportCollection}
                onChange={(e) => setExportCollection(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: '0.35rem',
                  marginBottom: '1rem',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: '0.9rem',
                }}
              >
                {EXPORT_COLLECTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exportLoading}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: 4,
                  background: '#1565c0',
                  color: '#fff',
                  cursor: exportLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {exportLoading ? 'Downloading...' : 'Download JSON'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Modal ────────────────────────────────────────────────── */}
      {showResetModal && (
        <div style={MODAL_OVERLAY} onClick={() => { setShowResetModal(false); setResetConfirm(''); setResetError(''); }}>
          <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#c62828' }}>Platform Reset</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 1rem' }}>
              This action will reset all platform data. Type <strong>RESET</strong> to confirm.
            </p>
            {resetError && (
              <div style={{ color: '#c62828', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                {resetError}
              </div>
            )}
            <input
              type="text"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="Type RESET"
              style={{
                display: 'block',
                width: '100%',
                padding: '0.5rem',
                marginBottom: '1rem',
                border: '1px solid #ccc',
                borderRadius: 4,
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowResetModal(false); setResetConfirm(''); setResetError(''); }}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetConfirm !== 'RESET' || resetLoading}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: 4,
                  background: resetConfirm === 'RESET' ? '#c62828' : '#ccc',
                  color: '#fff',
                  cursor: resetConfirm === 'RESET' && !resetLoading ? 'pointer' : 'not-allowed',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {resetLoading ? 'Resetting...' : 'Reset Platform'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
