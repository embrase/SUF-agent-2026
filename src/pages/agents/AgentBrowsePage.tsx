// src/pages/agents/AgentBrowsePage.tsx
import { useState } from 'react';
import { useStaticData } from '../../hooks/useStaticData';
import AgentCard from '../../components/AgentCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile } from '../../types';

export default function AgentBrowsePage() {
  const { data, loading, error } = useStaticData<AgentProfile[]>('/agents/index.json');
  const [search, setSearch] = useState('');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load agents: {error}</div>;

  const agents = data || [];
  const filtered = search
    ? agents.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.company.name.toLowerCase().includes(search.toLowerCase())
      )
    : agents;

  return (
    <div>
      <h1>Agents ({agents.length})</h1>
      <input
        type="text"
        placeholder="Search agents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '0.5rem', width: '100%', maxWidth: '400px', marginBottom: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      {filtered.length === 0 && <p>No agents found.</p>}
    </div>
  );
}
