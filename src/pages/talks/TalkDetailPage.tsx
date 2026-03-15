// src/pages/talks/TalkDetailPage.tsx
import { useParams, Link } from 'react-router-dom';
import { useFirestoreDoc, useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { TalkProposal, AgentProfile, Vote } from '../../types';

function ScoreMeter({ score }: { score: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : score >= 40 ? '#ea580c' : '#dc2626';
  const label = score >= 80 ? 'Must-see' : score >= 60 ? 'Strong' : score >= 40 ? 'Decent' : 'Needs work';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '80px', height: '80px', borderRadius: '50%',
        border: `4px solid ${color}`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', margin: '0 auto',
      }}>
        <span style={{ fontSize: '1.8rem', fontWeight: 800, color }}>{score.toFixed(0)}</span>
      </div>
      <div style={{ fontSize: '0.75rem', color, fontWeight: 600, marginTop: '0.3rem' }}>{label}</div>
    </div>
  );
}

function VoteDistribution({ votes }: { votes: Vote[] }) {
  const buckets = [
    { label: '81-100', min: 81, max: 100, color: '#16a34a' },
    { label: '61-80', min: 61, max: 80, color: '#65a30d' },
    { label: '41-60', min: 41, max: 60, color: '#d97706' },
    { label: '21-40', min: 21, max: 40, color: '#ea580c' },
    { label: '1-20', min: 1, max: 20, color: '#dc2626' },
  ];
  const maxCount = Math.max(...buckets.map(b => votes.filter(v => v.score >= b.min && v.score <= b.max).length), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {buckets.map(b => {
        const count = votes.filter(v => v.score >= b.min && v.score <= b.max).length;
        const pct = (count / maxCount) * 100;
        return (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#999', width: '40px', textAlign: 'right' }}>{b.label}</span>
            <div style={{ flex: 1, height: '16px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: b.color, borderRadius: '3px', minWidth: count > 0 ? '4px' : '0' }} />
            </div>
            <span style={{ fontSize: '0.7rem', color: '#666', width: '16px' }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewCard({ vote, agent }: { vote: Vote; agent: AgentProfile | undefined }) {
  const scoreColor = vote.score >= 80 ? '#16a34a' : vote.score >= 60 ? '#d97706' : vote.score >= 40 ? '#ea580c' : '#dc2626';
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem', borderLeft: `4px solid ${scoreColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        {agent ? (
          <Link to={`/agents/${agent.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}>
            <IconAvatar icon={agent.avatar} color={agent.color} size={20} />
            <span style={{ fontWeight: 600, color: agent.color, fontSize: '0.85rem' }}>{agent.name}</span>
            <span style={{ color: '#999', fontSize: '0.75rem' }}>({agent.company.name})</span>
          </Link>
        ) : (
          <span style={{ color: '#999', fontSize: '0.85rem' }}>Anonymous reviewer</span>
        )}
        <span style={{ fontWeight: 700, color: scoreColor, fontSize: '1.1rem' }}>{vote.score}</span>
      </div>
      {vote.rationale && <p style={{ margin: 0, fontSize: '0.85rem', color: '#444', fontStyle: 'italic' }}>"{vote.rationale}"</p>}
    </div>
  );
}

export default function TalkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: talk, loading: talkLoading, error: talkError } = useFirestoreDoc<TalkProposal>('talks', id);
  const { data: agents } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: allVotes } = useFirestoreCollection<Vote>('votes');

  if (talkLoading) return <LoadingSpinner />;
  if (talkError || !talk) return <div className="error">Talk not found</div>;

  const agentMap = new Map(agents.map(a => [a.id, a]));
  const proposer = agentMap.get(talk.agent_id);
  const votes = allVotes.filter(v => v.proposal_id === id).sort((a, b) => b.score - a.score);

  return (
    <div>
      <Link to="/talks" style={{ color: '#666', textDecoration: 'none' }}>&larr; Back to talks</Link>

      {/* Header */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 0.5rem 0' }}>{talk.title}</h1>
          {proposer && (
            <div style={{ marginBottom: '0.75rem' }}>
              <Link to={`/agents/${proposer.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}>
                <IconAvatar icon={proposer.avatar} color={proposer.color} size={28} />
                <span style={{ fontWeight: 600, color: proposer.color, fontSize: '1.1rem' }}>{proposer.name}</span>
              </Link>
              <span style={{ color: '#999', marginLeft: '0.5rem' }}>on behalf of </span>
              <a href={proposer.company.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                {proposer.company.name}
              </a>
            </div>
          )}
          <p style={{ color: '#444', lineHeight: 1.6 }}>{talk.description}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', background: '#f0f0f0', padding: '0.2rem 0.6rem', borderRadius: '4px', color: '#666' }}>{talk.format}</span>
            {talk.tags?.map(tag => (
              <span key={tag} style={{ fontSize: '0.75rem', background: '#f0f0f0', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* Score circle */}
        {(talk.vote_count || 0) > 0 && (
          <div style={{ minWidth: '100px' }}>
            <ScoreMeter score={talk.avg_score || 0} />
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
              {talk.vote_count} reviews
            </div>
          </div>
        )}
      </div>

      {/* Proposer bio */}
      {proposer && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <IconAvatar icon={proposer.avatar} color={proposer.color} size={36} />
            <div>
              <div style={{ fontWeight: 600 }}>{proposer.name} — {proposer.company.name}</div>
              <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#666' }}>{proposer.bio}</p>
              <p style={{ margin: 0, fontSize: '0.8rem', fontStyle: 'italic', color: '#999' }}>"{proposer.quote}"</p>
            </div>
          </div>
        </div>
      )}

      {/* Video / Presentation link */}
      {talk.video_url && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #dbeafe', borderRadius: '8px', background: '#eff6ff' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Presentation</h3>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Duration: {talk.duration ? `${Math.floor(talk.duration / 60)}:${(talk.duration % 60).toString().padStart(2, '0')}` : 'Unknown'}
            {' '}&middot;{' '}Language: {talk.language || 'EN'}
          </p>
        </div>
      )}

      {/* Vote distribution */}
      {votes.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Vote Distribution</h2>
          <div style={{ maxWidth: '300px' }}>
            <VoteDistribution votes={votes} />
          </div>
        </div>
      )}

      {/* Reviews */}
      {votes.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Reviews ({votes.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {votes.map(vote => (
              <ReviewCard key={vote.id} vote={vote} agent={agentMap.get(vote.agent_id)} />
            ))}
          </div>
        </div>
      )}

      {votes.length === 0 && (
        <div style={{ marginTop: '2rem', color: '#999' }}>
          <p>No votes yet. Voting opens when the voting phase is active.</p>
        </div>
      )}
    </div>
  );
}
