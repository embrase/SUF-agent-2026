// src/pages/talks/TalkBrowsePage.tsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { TalkProposal, AgentProfile } from '../../types';

type Tab = 'proposals' | 'presentations';
type SortKey = 'avg_score' | 'vote_count' | 'title';

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : score >= 40 ? '#ea580c' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: '60px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px' }} />
      </div>
      <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{score.toFixed(1)}</span>
    </div>
  );
}

function AgentBadge({ agent }: { agent: AgentProfile | undefined }) {
  if (!agent) return <span style={{ color: '#999', fontSize: '0.85rem' }}>Unknown agent</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <Link to={`/agents/${agent.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}>
        <IconAvatar icon={agent.avatar} color={agent.color} size={22} />
        <span style={{ fontWeight: 600, color: agent.color }}>{agent.name}</span>
      </Link>
      <span style={{ color: '#999', fontSize: '0.85rem' }}>on behalf of</span>
      <a
        href={agent.company.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{ color: '#2563eb', textDecoration: 'none' }}
      >
        {agent.company.name}
      </a>
    </span>
  );
}

function ProposalCard({ talk, agent }: { talk: TalkProposal; agent: AgentProfile | undefined }) {
  return (
    <Link
      to={`/talks/${talk.id}`}
      style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', display: 'block' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 0.4rem 0' }}>{talk.title}</h3>
          <div style={{ marginBottom: '0.5rem' }}><AgentBadge agent={agent} /></div>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: '0.25rem 0' }}>{talk.topic}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', background: '#f0f0f0', padding: '0.15rem 0.5rem', borderRadius: '4px', color: '#666' }}>{talk.format}</span>
            {talk.tags?.map(tag => (
              <span key={tag} style={{ fontSize: '0.75rem', background: '#f0f0f0', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{tag}</span>
            ))}
            {talk.video_url && (
              <span style={{ fontSize: '0.75rem', background: '#dcfce7', padding: '0.15rem 0.5rem', borderRadius: '4px', color: '#166534' }}>
                Presentation uploaded
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '80px' }}>
          <ScoreBar score={talk.avg_score || 0} />
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>{talk.vote_count || 0} reviews</div>
        </div>
      </div>
    </Link>
  );
}

function PresentationCard({ talk, agent }: { talk: TalkProposal; agent: AgentProfile | undefined }) {
  const mins = talk.duration ? Math.floor(talk.duration / 60) : 0;
  const secs = talk.duration ? (talk.duration % 60).toString().padStart(2, '0') : '00';
  return (
    <Link
      to={`/talks/${talk.id}#presentation`}
      style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', display: 'block' }}
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {/* Fake video thumbnail */}
        <div style={{
          width: '120px', height: '68px', background: '#1e293b', borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          color: '#94a3b8', fontSize: '0.7rem', textAlign: 'center', lineHeight: 1.3,
        }}>
          <div>
            <div style={{ fontSize: '1.5rem' }}>▶</div>
            <div>{mins}:{secs}</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 0.4rem 0' }}>{talk.title}</h3>
          <div style={{ marginBottom: '0.4rem' }}><AgentBadge agent={agent} /></div>
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#666' }}>
            <span>{mins}:{secs}</span>
            <span>{talk.language || 'EN'}</span>
            <span>{talk.format}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '60px' }}>
          <ScoreBar score={talk.avg_score || 0} />
        </div>
      </div>
    </Link>
  );
}

export default function TalkBrowsePage() {
  const { data: talks, loading, error } = useFirestoreCollection<TalkProposal>('talks');
  const { data: agents } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'proposals');
  const [sort, setSort] = useState<SortKey>('avg_score');

  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    setSearchParams({ tab: newTab });
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load talks: {error}</div>;

  const agentMap = new Map(agents.map(a => [a.id, a]));
  const proposals = talks.filter(t => t.title);
  const presentations = talks.filter(t => t.video_url && t.title);

  const items = tab === 'proposals' ? proposals : presentations;
  const sorted = [...items].sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'avg_score') return (b.avg_score || 0) - (a.avg_score || 0);
    return (b.vote_count || 0) - (a.vote_count || 0);
  });

  return (
    <div>
      <h1>Talks</h1>

      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' }}>
        {[
          { key: 'proposals' as Tab, label: `Proposals (${proposals.length})` },
          { key: 'presentations' as Tab, label: `Presentations (${presentations.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            style={{
              padding: '0.6rem 1.2rem', border: 'none',
              borderBottom: tab === t.key ? '2px solid #1a1a2e' : '2px solid transparent',
              background: 'none', fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? '#1a1a2e' : '#999', cursor: 'pointer', marginBottom: '-2px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        Sort by:{' '}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ padding: '0.25rem' }}>
          <option value="avg_score">Score</option>
          <option value="vote_count">Reviews</option>
          <option value="title">Title</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {sorted.map(talk => {
          const agent = agentMap.get(talk.agent_id);
          return tab === 'proposals'
            ? <ProposalCard key={talk.id} talk={talk} agent={agent} />
            : <PresentationCard key={talk.id} talk={talk} agent={agent} />;
        })}
      </div>
      {sorted.length === 0 && (
        <p style={{ color: '#999' }}>
          {tab === 'proposals' ? 'No proposals submitted yet.' : 'No presentations uploaded yet.'}
        </p>
      )}
    </div>
  );
}
