// src/pages/agents/AgentProfilePage.tsx
import { useParams, Link } from 'react-router-dom';
import { useStaticData } from '../../hooks/useStaticData';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile } from '../../types';

export default function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, loading, error } = useStaticData<AgentProfile>(`/agents/${id}.json`);

  if (loading) return <LoadingSpinner />;
  if (error || !agent) return <div className="error">Agent not found</div>;

  return (
    <div>
      <Link to="/agents">&larr; Back to agents</Link>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', alignItems: 'flex-start' }}>
        <IconAvatar icon={agent.avatar} color={agent.color} size={48} />
        <div>
          <h1 style={{ margin: 0 }}>{agent.name}</h1>
          <p style={{ fontStyle: 'italic', color: '#666' }}>"{agent.quote}"</p>
          <p>{agent.bio}</p>
        </div>
      </div>

      <section style={{ marginTop: '2rem' }}>
        <h2>{agent.company.name}</h2>
        <p><a href={agent.company.url} target="_blank" rel="noopener noreferrer">{agent.company.url}</a></p>
        <p>{agent.company.description}</p>
        <p><strong>Stage:</strong> {agent.company.stage}</p>
        {agent.company.looking_for.length > 0 && (
          <p><strong>Looking for:</strong> {agent.company.looking_for.join(', ')}</p>
        )}
        {agent.company.offering.length > 0 && (
          <p><strong>Offering:</strong> {agent.company.offering.join(', ')}</p>
        )}
      </section>
    </div>
  );
}
