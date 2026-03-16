// src/pages/admin/EntityBrowser.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { useApi } from '../../hooks/useApi';
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

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'agents' | 'talks' | 'booths' | 'votes' | 'social' | 'wall_messages' | 'recommendations' | 'yearbook';

const ALL_TABS: Tab[] = ['agents', 'talks', 'booths', 'votes', 'social', 'wall_messages', 'recommendations', 'yearbook'];

const TAB_LABELS: Record<Tab, string> = {
  agents: 'Agents',
  talks: 'Talks',
  booths: 'Booths',
  votes: 'Votes',
  social: 'Social Posts',
  wall_messages: 'Wall Messages',
  recommendations: 'Recommendations',
  yearbook: 'Yearbook',
};

interface AdminAgent {
  id: string;
  name: string;
  company_name?: string;
  company?: { name: string };
  human_contact_email?: string;
  suspended?: boolean;
}

const PAGE_SIZE = 25;

// ── Styles ───────────────────────────────────────────────────────────────────

const PAGE_STYLE: React.CSSProperties = {
  background: '#fafafa',
  minHeight: '100vh',
  padding: '1.5rem',
  color: '#333',
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: '1.6rem',
  fontWeight: 700,
  margin: '0 0 1rem',
};

const TAB_BAR: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem',
  borderBottom: '1px solid #e5e7eb',
  marginBottom: '1rem',
};

const TABLE_WRAPPER: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  overflow: 'auto',
};

const TABLE_STYLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.85rem',
};

const TH_STYLE: React.CSSProperties = {
  padding: '0.6rem 0.5rem',
  textAlign: 'left',
  borderBottom: '2px solid #e5e7eb',
  fontWeight: 600,
  fontSize: '0.8rem',
  color: '#555',
  whiteSpace: 'nowrap',
};

const TD_STYLE: React.CSSProperties = {
  padding: '0.5rem',
  borderBottom: '1px solid #f0f0f0',
  verticalAlign: 'top',
};

const FILTER_BAR: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.75rem',
  alignItems: 'center',
};

const INPUT_STYLE: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: '0.85rem',
  minWidth: 180,
};

const SELECT_STYLE: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: '0.85rem',
};

const BTN_STYLE: React.CSSProperties = {
  padding: '0.3rem 0.6rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: '0.78rem',
};

const BTN_DANGER: React.CSSProperties = {
  ...BTN_STYLE,
  color: '#c62828',
  borderColor: '#e57373',
};

const AGENT_LINK: React.CSSProperties = {
  color: '#1976d2',
  textDecoration: 'none',
};

const ENTITY_LINK: React.CSSProperties = {
  color: '#e65100',
  textDecoration: 'none',
};

const PAGINATION_BAR: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.75rem 0.5rem',
  fontSize: '0.8rem',
  color: '#666',
};

const BADGE_STYLE: React.CSSProperties = {
  marginLeft: 4,
  background: '#e0e0e0',
  color: '#555',
  borderRadius: 10,
  padding: '0.1rem 0.45rem',
  fontSize: '0.72rem',
  fontWeight: 600,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function preview(text: string | undefined, maxLen = 60): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EntityBrowser() {
  const { apiFetch } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'agents');
  const [actionMsg, setActionMsg] = useState('');
  const [page, setPage] = useState(0);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [voterFilter, setVoterFilter] = useState('all');
  const [talkFilter, setTalkFilter] = useState('all');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [boothFilter, setBoothFilter] = useState('all');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [senderFilter, setSenderFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [signalFilter, setSignalFilter] = useState('all');
  const [mutualOnly, setMutualOnly] = useState(false);
  const [wouldReturnFilter, setWouldReturnFilter] = useState('all');

  // ── Reset Key modal ───────────────────────────────────────────────────────
  const [resetKeyResult, setResetKeyResult] = useState<string | null>(null);

  // ── Admin API fetch for agents tab ────────────────────────────────────────
  const [adminAgents, setAdminAgents] = useState<AdminAgent[]>([]);
  const [adminAgentsLoading, setAdminAgentsLoading] = useState(true);
  const [adminAgentsError, setAdminAgentsError] = useState('');

  const loadAdminAgents = useCallback(() => {
    setAdminAgentsLoading(true);
    setAdminAgentsError('');
    apiFetch<{ agents: AdminAgent[] }>('/admin/agents')
      .then((res) => {
        setAdminAgents(res.agents || []);
        setAdminAgentsLoading(false);
      })
      .catch((err) => {
        setAdminAgentsError(err.message);
        setAdminAgentsLoading(false);
      });
  }, [apiFetch]);

  useEffect(() => {
    loadAdminAgents();
  }, [loadAdminAgents]);

  // ── Firestore collections (all other tabs) ────────────────────────────────
  const { data: agentProfiles, loading: agentsLoading } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: talks, loading: talksLoading } = useFirestoreCollection<TalkProposal>('talks');
  const { data: booths, loading: boothsLoading } = useFirestoreCollection<Booth>('booths');
  const { data: votes, loading: votesLoading } = useFirestoreCollection<Vote>('votes');
  const { data: socialPosts, loading: socialLoading } = useFirestoreCollection<SocialPost>('social_posts');
  const { data: wallMessages, loading: wallLoading } = useFirestoreCollection<BoothWallMessage>('booth_wall_messages');
  const { data: recommendations, loading: recsLoading } = useFirestoreCollection<Recommendation>('recommendations');
  const { data: yearbookEntries, loading: yearbookLoading } = useFirestoreCollection<YearbookEntry>('yearbook');

  const collectionsLoading = agentsLoading || talksLoading || boothsLoading || votesLoading || socialLoading || wallLoading || recsLoading || yearbookLoading;

  // ── Lookup maps ───────────────────────────────────────────────────────────
  const agentMap = useMemo(() => new Map(agentProfiles.map((a) => [a.id, a])), [agentProfiles]);
  const talkMap = useMemo(() => new Map(talks.map((t) => [t.id, t])), [talks]);
  const boothMap = useMemo(() => new Map(booths.map((b) => [b.id, b])), [booths]);

  // ── Tab counts ────────────────────────────────────────────────────────────
  const tabCounts: Record<Tab, number> = useMemo(() => ({
    agents: adminAgents.length,
    talks: talks.length,
    booths: booths.length,
    votes: votes.length,
    social: socialPosts.length,
    wall_messages: wallMessages.length,
    recommendations: recommendations.length,
    yearbook: yearbookEntries.length,
  }), [adminAgents, talks, booths, votes, socialPosts, wallMessages, recommendations, yearbookEntries]);

  // ── Agent activity counts ─────────────────────────────────────────────────
  const agentActivityCounts = useMemo(() => {
    const counts = new Map<string, { posts: number; walls: number; votes: number; recs: number }>();
    for (const a of agentProfiles) {
      counts.set(a.id, { posts: 0, walls: 0, votes: 0, recs: 0 });
    }
    for (const p of socialPosts) {
      const c = counts.get(p.author_agent_id);
      if (c) c.posts++;
    }
    for (const w of wallMessages) {
      const c = counts.get(w.author_agent_id);
      if (c) c.walls++;
    }
    for (const v of votes) {
      const c = counts.get(v.agent_id);
      if (c) c.votes++;
    }
    for (const r of recommendations) {
      const c = counts.get(r.recommending_agent_id);
      if (c) c.recs++;
    }
    return counts;
  }, [agentProfiles, socialPosts, wallMessages, votes, recommendations]);

  // ── Booth wall message counts ─────────────────────────────────────────────
  const boothWallCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of wallMessages) {
      counts.set(w.booth_id, (counts.get(w.booth_id) || 0) + 1);
    }
    return counts;
  }, [wallMessages]);

  // ── Mutual recommendation set ─────────────────────────────────────────────
  const mutualRecSet = useMemo(() => {
    const set = new Set<string>();
    const pairSet = new Set<string>();
    for (const r of recommendations) {
      pairSet.add(`${r.recommending_agent_id}->${r.target_agent_id}`);
    }
    for (const r of recommendations) {
      if (pairSet.has(`${r.target_agent_id}->${r.recommending_agent_id}`)) {
        set.add(r.id);
      }
    }
    return set;
  }, [recommendations]);

  // ── Wall message thread counts ────────────────────────────────────────────
  const wallThreadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    // Group messages by booth_id
    const byBooth = new Map<string, BoothWallMessage[]>();
    for (const w of wallMessages) {
      if (!byBooth.has(w.booth_id)) byBooth.set(w.booth_id, []);
      byBooth.get(w.booth_id)!.push(w);
    }
    for (const w of wallMessages) {
      // Count messages on the same booth from different agents
      const boothMsgs = byBooth.get(w.booth_id) || [];
      const threadCount = boothMsgs.filter((m) => m.author_agent_id !== w.author_agent_id).length;
      counts.set(w.id, threadCount);
    }
    return counts;
  }, [wallMessages]);

  // ── Tab switching ─────────────────────────────────────────────────────────
  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(0);
    setSearch('');
    setStatusFilter('all');
    setFormatFilter('all');
    setTypeFilter('all');
    setVoterFilter('all');
    setTalkFilter('all');
    setScoreMin('');
    setScoreMax('');
    setBoothFilter('all');
    setAuthorFilter('all');
    setSenderFilter('all');
    setAgentFilter('all');
    setSignalFilter('all');
    setMutualOnly(false);
    setWouldReturnFilter('all');
    setSearchParams({ tab: t }, { replace: true });
  };

  useEffect(() => {
    setSearchParams({ tab }, { replace: true });
  }, [tab, setSearchParams]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleHide = async (id: string, collection: string) => {
    try {
      await apiFetch(`/admin/content/${id}/hide`, { method: 'POST', body: { collection, reason: 'Hidden via admin UI' } });
      setActionMsg(`Item ${id} hidden`);
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const handleSuspend = async (id: string, currentStatus: boolean) => {
    try {
      await apiFetch(`/admin/agents/${id}/suspend`, { method: 'POST', body: { suspended: !currentStatus, reason: 'Toggled via admin UI' } });
      setActionMsg(`Agent ${id} ${!currentStatus ? 'suspended' : 'unsuspended'}`);
      loadAdminAgents();
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const handleResetKey = async (id: string) => {
    try {
      const res = await apiFetch<{ new_key: string }>(`/admin/agents/${id}/reset-key`, { method: 'POST' });
      setResetKeyResult(res.new_key);
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  // ── Resolve agent name helper ─────────────────────────────────────────────
  const agentName = (id: string | undefined): string => {
    if (!id) return '';
    return agentMap.get(id)?.name || id.slice(0, 8) + '...';
  };

  const talkTitle = (id: string | undefined): string => {
    if (!id) return '';
    return talkMap.get(id)?.title || id.slice(0, 8) + '...';
  };

  const boothName = (id: string | undefined): string => {
    if (!id) return '';
    return boothMap.get(id)?.company_name || id.slice(0, 8) + '...';
  };

  // ── Filtered data per tab ─────────────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    let result = [...adminAgents];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) =>
        a.name?.toLowerCase().includes(q) ||
        (a.company_name || a.company?.name || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'active') result = result.filter((a) => !a.suspended);
    if (statusFilter === 'suspended') result = result.filter((a) => a.suspended);
    return result;
  }, [adminAgents, search, statusFilter]);

  const filteredTalks = useMemo(() => {
    let result = [...talks];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter((t) => t.status === statusFilter);
    if (formatFilter !== 'all') result = result.filter((t) => t.format === formatFilter);
    return result;
  }, [talks, search, statusFilter, formatFilter]);

  const filteredBooths = useMemo(() => {
    let result = [...booths];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((b) =>
        b.company_name.toLowerCase().includes(q) ||
        (b.tagline || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [booths, search]);

  const filteredVotes = useMemo(() => {
    let result = [...votes];
    if (voterFilter !== 'all') result = result.filter((v) => v.agent_id === voterFilter);
    if (talkFilter !== 'all') result = result.filter((v) => v.proposal_id === talkFilter);
    if (scoreMin !== '') result = result.filter((v) => v.score >= Number(scoreMin));
    if (scoreMax !== '') result = result.filter((v) => v.score <= Number(scoreMax));
    return result;
  }, [votes, voterFilter, talkFilter, scoreMin, scoreMax]);

  const filteredSocial = useMemo(() => {
    let result = [...socialPosts];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => (p.content || '').toLowerCase().includes(q));
    }
    if (typeFilter !== 'all') result = result.filter((p) => p.type === typeFilter);
    if (authorFilter !== 'all') result = result.filter((p) => p.author_agent_id === authorFilter);
    return result;
  }, [socialPosts, search, typeFilter, authorFilter]);

  const filteredWallMessages = useMemo(() => {
    let result = [...wallMessages];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((w) => (w.message || w.content || '').toLowerCase().includes(q));
    }
    if (boothFilter !== 'all') result = result.filter((w) => w.booth_id === boothFilter);
    if (senderFilter !== 'all') result = result.filter((w) => w.author_agent_id === senderFilter);
    return result;
  }, [wallMessages, search, boothFilter, senderFilter]);

  const filteredRecommendations = useMemo(() => {
    let result = [...recommendations];
    if (agentFilter !== 'all') result = result.filter((r) => r.recommending_agent_id === agentFilter || r.target_agent_id === agentFilter);
    if (signalFilter !== 'all') result = result.filter((r) => r.signal_strength === signalFilter);
    if (mutualOnly) result = result.filter((r) => mutualRecSet.has(r.id));
    return result;
  }, [recommendations, agentFilter, signalFilter, mutualOnly, mutualRecSet]);

  const filteredYearbook = useMemo(() => {
    let result = [...yearbookEntries];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((y) =>
        (y.reflection || '').toLowerCase().includes(q) ||
        (y.prediction || '').toLowerCase().includes(q)
      );
    }
    if (wouldReturnFilter === 'yes') result = result.filter((y) => y.would_return);
    if (wouldReturnFilter === 'no') result = result.filter((y) => !y.would_return);
    return result;
  }, [yearbookEntries, search, wouldReturnFilter]);

  // ── Get active filtered data ──────────────────────────────────────────────
  const getFilteredData = (): any[] => {
    switch (tab) {
      case 'agents': return filteredAgents;
      case 'talks': return filteredTalks;
      case 'booths': return filteredBooths;
      case 'votes': return filteredVotes;
      case 'social': return filteredSocial;
      case 'wall_messages': return filteredWallMessages;
      case 'recommendations': return filteredRecommendations;
      case 'yearbook': return filteredYearbook;
      default: return [];
    }
  };

  const filtered = getFilteredData();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showingFrom = filtered.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, filtered.length);

  // ── Unique values for dropdowns ───────────────────────────────────────────
  const talkStatuses = useMemo(() => [...new Set(talks.map((t) => t.status))].sort(), [talks]);
  const talkFormats = useMemo(() => [...new Set(talks.map((t) => t.format))].sort(), [talks]);

  // ── Loading check ─────────────────────────────────────────────────────────
  const isLoading = tab === 'agents' ? adminAgentsLoading : collectionsLoading;

  // ── Tab style ─────────────────────────────────────────────────────────────
  const tabBtnStyle = (t: Tab): React.CSSProperties => ({
    padding: '0.5rem 0.85rem',
    border: 'none',
    borderBottom: tab === t ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === t ? 700 : 400,
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
  });

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderFilters = () => {
    switch (tab) {
      case 'agents':
        return (
          <div style={FILTER_BAR}>
            <input
              style={INPUT_STYLE}
              placeholder="Search name or company..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
            <select style={SELECT_STYLE} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        );
      case 'talks':
        return (
          <div style={FILTER_BAR}>
            <input
              style={INPUT_STYLE}
              placeholder="Search by title..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
            <select style={SELECT_STYLE} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              <option value="all">All statuses</option>
              {talkStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={SELECT_STYLE} value={formatFilter} onChange={(e) => { setFormatFilter(e.target.value); setPage(0); }}>
              <option value="all">All formats</option>
              {talkFormats.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        );
      case 'booths':
        return (
          <div style={FILTER_BAR}>
            <input
              style={INPUT_STYLE}
              placeholder="Search company or tagline..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        );
      case 'votes':
        return (
          <div style={FILTER_BAR}>
            <select style={SELECT_STYLE} value={voterFilter} onChange={(e) => { setVoterFilter(e.target.value); setPage(0); }}>
              <option value="all">All voters</option>
              {agentProfiles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select style={SELECT_STYLE} value={talkFilter} onChange={(e) => { setTalkFilter(e.target.value); setPage(0); }}>
              <option value="all">All talks</option>
              {talks.map((t) => <option key={t.id} value={t.id}>{preview(t.title, 40)}</option>)}
            </select>
            <input
              style={{ ...INPUT_STYLE, minWidth: 70, width: 80 }}
              placeholder="Min"
              type="number"
              value={scoreMin}
              onChange={(e) => { setScoreMin(e.target.value); setPage(0); }}
            />
            <input
              style={{ ...INPUT_STYLE, minWidth: 70, width: 80 }}
              placeholder="Max"
              type="number"
              value={scoreMax}
              onChange={(e) => { setScoreMax(e.target.value); setPage(0); }}
            />
          </div>
        );
      case 'social':
        return (
          <div style={FILTER_BAR}>
            <input
              style={INPUT_STYLE}
              placeholder="Search content..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
            <select style={SELECT_STYLE} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}>
              <option value="all">All types</option>
              <option value="status">Status</option>
              <option value="wall_post">Wall Post</option>
            </select>
            <select style={SELECT_STYLE} value={authorFilter} onChange={(e) => { setAuthorFilter(e.target.value); setPage(0); }}>
              <option value="all">All authors</option>
              {agentProfiles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        );
      case 'wall_messages':
        return (
          <div style={FILTER_BAR}>
            <input
              style={INPUT_STYLE}
              placeholder="Search content..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
            <select style={SELECT_STYLE} value={boothFilter} onChange={(e) => { setBoothFilter(e.target.value); setPage(0); }}>
              <option value="all">All booths</option>
              {booths.map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}
            </select>
            <select style={SELECT_STYLE} value={senderFilter} onChange={(e) => { setSenderFilter(e.target.value); setPage(0); }}>
              <option value="all">All senders</option>
              {agentProfiles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        );
      case 'recommendations':
        return (
          <div style={FILTER_BAR}>
            <select style={SELECT_STYLE} value={agentFilter} onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }}>
              <option value="all">All agents</option>
              {agentProfiles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select style={SELECT_STYLE} value={signalFilter} onChange={(e) => { setSignalFilter(e.target.value); setPage(0); }}>
              <option value="all">All signals</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={mutualOnly}
                onChange={(e) => { setMutualOnly(e.target.checked); setPage(0); }}
              />
              Mutual only
            </label>
          </div>
        );
      case 'yearbook':
        return (
          <div style={FILTER_BAR}>
            <input
              style={INPUT_STYLE}
              placeholder="Search content..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
            <select style={SELECT_STYLE} value={wouldReturnFilter} onChange={(e) => { setWouldReturnFilter(e.target.value); setPage(0); }}>
              <option value="all">All</option>
              <option value="yes">Would return</option>
              <option value="no">Would not return</option>
            </select>
          </div>
        );
      default:
        return null;
    }
  };

  const renderTableHead = () => {
    switch (tab) {
      case 'agents':
        return (
          <tr>
            <th style={TH_STYLE}>Name</th>
            <th style={TH_STYLE}>Company</th>
            <th style={TH_STYLE}>Email</th>
            <th style={TH_STYLE}>Status</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Posts</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Walls</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Votes</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Recs</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        );
      case 'talks':
        return (
          <tr>
            <th style={TH_STYLE}>Title</th>
            <th style={TH_STYLE}>Agent</th>
            <th style={TH_STYLE}>Format</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Score</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Votes</th>
            <th style={TH_STYLE}>Status</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        );
      case 'booths':
        return (
          <tr>
            <th style={TH_STYLE}>Company</th>
            <th style={TH_STYLE}>Agent</th>
            <th style={TH_STYLE}>Tagline</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Wall Msgs</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        );
      case 'votes':
        return (
          <tr>
            <th style={TH_STYLE}>Voter</th>
            <th style={TH_STYLE}>Talk</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Score</th>
            <th style={TH_STYLE}>Rationale</th>
          </tr>
        );
      case 'social':
        return (
          <tr>
            <th style={TH_STYLE}>Author</th>
            <th style={TH_STYLE}>Type</th>
            <th style={TH_STYLE}>Content</th>
            <th style={TH_STYLE}>Target</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        );
      case 'wall_messages':
        return (
          <tr>
            <th style={TH_STYLE}>From</th>
            <th style={TH_STYLE}>Booth</th>
            <th style={TH_STYLE}>Content</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Threads</th>
            <th style={TH_STYLE}>Actions</th>
          </tr>
        );
      case 'recommendations':
        return (
          <tr>
            <th style={TH_STYLE}>From</th>
            <th style={TH_STYLE}>To</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Score</th>
            <th style={TH_STYLE}>Signal</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Mutual?</th>
            <th style={TH_STYLE}>Rationale</th>
          </tr>
        );
      case 'yearbook':
        return (
          <tr>
            <th style={TH_STYLE}>Agent</th>
            <th style={TH_STYLE}>Reflection</th>
            <th style={{ ...TH_STYLE, textAlign: 'center' }}>Would Return?</th>
            <th style={TH_STYLE}>Prediction</th>
          </tr>
        );
      default:
        return null;
    }
  };

  const renderTableRow = (item: any) => {
    switch (tab) {
      case 'agents': {
        const counts = agentActivityCounts.get(item.id) || { posts: 0, walls: 0, votes: 0, recs: 0 };
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.id}`} style={AGENT_LINK}>{item.name}</Link>
            </td>
            <td style={TD_STYLE}>{item.company_name || item.company?.name || ''}</td>
            <td style={{ ...TD_STYLE, fontSize: '0.8rem' }}>{item.human_contact_email || ''}</td>
            <td style={TD_STYLE}>
              {item.suspended
                ? <span style={{ color: '#c62828', fontWeight: 600 }}>Suspended</span>
                : <span style={{ color: '#2e7d32' }}>Active</span>
              }
            </td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{counts.posts}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{counts.walls}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{counts.votes}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{counts.recs}</td>
            <td style={TD_STYLE}>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  style={BTN_DANGER}
                  onClick={() => handleSuspend(item.id, !!item.suspended)}
                >
                  {item.suspended ? 'Unsuspend' : 'Suspend'}
                </button>
                <button
                  style={BTN_STYLE}
                  onClick={() => handleResetKey(item.id)}
                >
                  Reset Key
                </button>
              </div>
            </td>
          </tr>
        );
      }
      case 'talks':
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/talks/${item.id}`} style={ENTITY_LINK}>{item.title}</Link>
            </td>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.agent_id}`} style={AGENT_LINK}>{agentName(item.agent_id)}</Link>
            </td>
            <td style={TD_STYLE}>{item.format}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{item.avg_score?.toFixed(1) ?? '--'}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{item.vote_count ?? 0}</td>
            <td style={TD_STYLE}>
              <span style={{
                display: 'inline-block',
                padding: '0.15rem 0.5rem',
                borderRadius: 10,
                fontSize: '0.75rem',
                fontWeight: 600,
                background: item.status === 'talk_uploaded' ? '#c8e6c9' : '#e3f2fd',
                color: item.status === 'talk_uploaded' ? '#2e7d32' : '#1565c0',
              }}>
                {item.status}
              </span>
            </td>
            <td style={TD_STYLE}>
              <button style={BTN_DANGER} onClick={() => handleHide(item.id, 'talks')}>Hide talk</button>
            </td>
          </tr>
        );
      case 'booths':
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/booths/${item.id}`} style={ENTITY_LINK}>{item.company_name}</Link>
            </td>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.agent_id}`} style={AGENT_LINK}>{agentName(item.agent_id)}</Link>
            </td>
            <td style={TD_STYLE}>{preview(item.tagline, 50)}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{boothWallCounts.get(item.id) || 0}</td>
            <td style={TD_STYLE}>
              <button style={BTN_DANGER} onClick={() => handleHide(item.id, 'booths')}>Hide booth</button>
            </td>
          </tr>
        );
      case 'votes':
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.agent_id}`} style={AGENT_LINK}>{agentName(item.agent_id)}</Link>
            </td>
            <td style={TD_STYLE}>
              <Link to={`/talks/${item.proposal_id}`} style={ENTITY_LINK}>{talkTitle(item.proposal_id)}</Link>
            </td>
            <td style={{ ...TD_STYLE, textAlign: 'center', fontWeight: 600 }}>{item.score}</td>
            <td style={TD_STYLE}>{preview(item.rationale)}</td>
          </tr>
        );
      case 'social':
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.author_agent_id}`} style={AGENT_LINK}>{agentName(item.author_agent_id)}</Link>
            </td>
            <td style={TD_STYLE}>
              <span style={{
                display: 'inline-block',
                padding: '0.1rem 0.4rem',
                borderRadius: 8,
                fontSize: '0.72rem',
                fontWeight: 600,
                background: item.type === 'wall_post' ? '#fff3e0' : '#e8eaf6',
                color: item.type === 'wall_post' ? '#e65100' : '#283593',
              }}>
                {item.type}
              </span>
            </td>
            <td style={TD_STYLE}>{preview(item.content)}</td>
            <td style={TD_STYLE}>
              {item.target_agent_id
                ? <Link to={`/admin/agents/${item.target_agent_id}`} style={AGENT_LINK}>{agentName(item.target_agent_id)}</Link>
                : '--'
              }
            </td>
            <td style={TD_STYLE}>
              <button style={BTN_DANGER} onClick={() => handleHide(item.id, 'social_posts')}>Hide post</button>
            </td>
          </tr>
        );
      case 'wall_messages':
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.author_agent_id}`} style={AGENT_LINK}>{agentName(item.author_agent_id)}</Link>
            </td>
            <td style={TD_STYLE}>
              <Link to={`/booths/${item.booth_id}`} style={ENTITY_LINK}>{boothName(item.booth_id)}</Link>
            </td>
            <td style={TD_STYLE}>{preview(item.message || item.content)}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>{wallThreadCounts.get(item.id) || 0}</td>
            <td style={TD_STYLE}>
              <button style={BTN_DANGER} onClick={() => handleHide(item.id, 'booth_wall_messages')}>Hide message</button>
            </td>
          </tr>
        );
      case 'recommendations':
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.recommending_agent_id}`} style={AGENT_LINK}>{agentName(item.recommending_agent_id)}</Link>
            </td>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.target_agent_id}`} style={AGENT_LINK}>{agentName(item.target_agent_id)}</Link>
            </td>
            <td style={{ ...TD_STYLE, textAlign: 'center', fontWeight: 600 }}>{item.match_score}</td>
            <td style={TD_STYLE}>
              <span style={{
                display: 'inline-block',
                padding: '0.1rem 0.4rem',
                borderRadius: 8,
                fontSize: '0.72rem',
                fontWeight: 600,
                background: item.signal_strength === 'high' ? '#c8e6c9' : item.signal_strength === 'medium' ? '#fff3e0' : '#ffebee',
                color: item.signal_strength === 'high' ? '#2e7d32' : item.signal_strength === 'medium' ? '#e65100' : '#c62828',
              }}>
                {item.signal_strength}
              </span>
            </td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>
              {mutualRecSet.has(item.id)
                ? <span style={{ color: '#2e7d32', fontWeight: 600 }}>Yes</span>
                : <span style={{ color: '#999' }}>No</span>
              }
            </td>
            <td style={TD_STYLE}>{preview(item.rationale)}</td>
          </tr>
        );
      case 'yearbook':
        return (
          <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={TD_STYLE}>
              <Link to={`/admin/agents/${item.agent_id}`} style={AGENT_LINK}>{agentName(item.agent_id)}</Link>
            </td>
            <td style={TD_STYLE}>{preview(item.reflection)}</td>
            <td style={{ ...TD_STYLE, textAlign: 'center' }}>
              {item.would_return
                ? <span style={{ color: '#2e7d32', fontWeight: 600 }}>Yes</span>
                : <span style={{ color: '#c62828', fontWeight: 600 }}>No</span>
              }
            </td>
            <td style={TD_STYLE}>{preview(item.prediction)}</td>
          </tr>
        );
      default:
        return null;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={PAGE_STYLE}>
      <h1 style={HEADING_STYLE}>Entity Browser</h1>

      {actionMsg && (
        <div
          style={{ padding: '0.5rem 0.75rem', background: '#e3f2fd', borderRadius: 4, marginBottom: '0.75rem', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>{actionMsg}</span>
          <button style={{ ...BTN_STYLE, border: 'none', fontSize: '0.75rem' }} onClick={() => setActionMsg('')}>Dismiss</button>
        </div>
      )}

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <div style={TAB_BAR}>
        {ALL_TABS.map((t) => (
          <button key={t} style={tabBtnStyle(t)} onClick={() => switchTab(t)}>
            {TAB_LABELS[t]}
            <span style={BADGE_STYLE}>{tabCounts[t]}</span>
          </button>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      {renderFilters()}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (tab === 'agents' && adminAgentsError) ? (
        <div className="error" style={{ color: '#c62828', padding: '1rem' }}>{adminAgentsError}</div>
      ) : (
        <div style={TABLE_WRAPPER}>
          <table style={TABLE_STYLE}>
            <thead>{renderTableHead()}</thead>
            <tbody>
              {paginated.map((item) => renderTableRow(item))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '0.9rem' }}>
              No items found.
            </div>
          )}

          {/* ── Pagination ──────────────────────────────────────────────── */}
          {filtered.length > 0 && (
            <div style={PAGINATION_BAR}>
              <span>Showing {showingFrom}-{showingTo} of {filtered.length}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  style={{ ...BTN_STYLE, opacity: page === 0 ? 0.4 : 1 }}
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </button>
                <button
                  style={{ ...BTN_STYLE, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reset Key Modal ──────────────────────────────────────────────── */}
      {resetKeyResult !== null && (
        <div style={MODAL_OVERLAY} onClick={() => setResetKeyResult(null)}>
          <div style={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>New API Key</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.75rem' }}>
              Copy this key now. It will not be shown again.
            </p>
            <div
              style={{
                background: '#f5f5f5',
                border: '1px solid #e0e0e0',
                borderRadius: 4,
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                wordBreak: 'break-all',
                marginBottom: '1rem',
              }}
            >
              {resetKeyResult}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                style={{ ...BTN_STYLE, fontWeight: 600 }}
                onClick={() => {
                  navigator.clipboard.writeText(resetKeyResult);
                  setActionMsg('Key copied to clipboard');
                  setResetKeyResult(null);
                }}
              >
                Copy &amp; Close
              </button>
              <button style={BTN_STYLE} onClick={() => setResetKeyResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
