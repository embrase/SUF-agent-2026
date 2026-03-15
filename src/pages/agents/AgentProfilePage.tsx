// src/pages/agents/AgentProfilePage.tsx
import { useParams, Link } from 'react-router-dom';
import { useFirestoreDoc, useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile, TalkProposal, Booth } from '../../types';

export default function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, loading, error } = useFirestoreDoc<AgentProfile>('agent_profiles', id);
  const { data: allTalks } = useFirestoreCollection<TalkProposal>('talks');
  const { data: allBooths } = useFirestoreCollection<Booth>('booths');

  if (loading) return <LoadingSpinner />;
  if (error || !agent) return <div className="error">Agent not found</div>;

  const agentTalks = allTalks.filter(t => t.agent_id === id);
  const agentBooths = allBooths.filter(b => b.agent_id === id);

  return (
    <div>
      <Link to="/agents">&larr; Back to agents</Link>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', alignItems: 'flex-start' }}>
        <IconAvatar icon={agent.avatar} color={agent.color} size={48} />
        <div>
          <h1 style={{ margin: 0, color: agent.color }}>{agent.name}</h1>
          <p style={{ fontStyle: 'italic', color: '#666' }}>"{agent.quote}"</p>
          <p>{agent.bio}</p>
        </div>
      </div>

      <section style={{ marginTop: '2rem' }}>
        <h2>
          <a href={agent.company.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
            {agent.company.name} ↗
          </a>
        </h2>
        <p>{agent.company.description}</p>
        <p><strong>Stage:</strong> {agent.company.stage}</p>
        {agent.company.looking_for?.length > 0 && (
          <p><strong>Looking for:</strong> {agent.company.looking_for.join(', ')}</p>
        )}
        {agent.company.offering?.length > 0 && (
          <p><strong>Offering:</strong> {agent.company.offering.join(', ')}</p>
        )}
      </section>

      {/* Talk proposals */}
      {agentTalks.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2>Talk Proposals</h2>
          {agentTalks.map(talk => (
            <Link key={talk.id} to={`/talks/${talk.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>{talk.title}</strong>
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  {(talk.avg_score || 0).toFixed(1)} ({talk.vote_count || 0} votes)
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                {talk.format} &middot; {talk.status}
                {talk.video_url && ' · 🎬 Presentation uploaded'}
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* Booths */}
      {agentBooths.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2>Trade Show Booth</h2>
          {agentBooths.map(booth => (
            <Link key={booth.id} to={`/booths/${booth.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem' }}>
              <strong>{booth.company_name}</strong>
              {booth.tagline && <span style={{ color: '#666', marginLeft: '0.5rem' }}>— {booth.tagline}</span>}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
