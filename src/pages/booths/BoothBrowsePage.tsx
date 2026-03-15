// src/pages/booths/BoothBrowsePage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Booth, AgentProfile } from '../../types';

interface WallMessage {
  id: string;
  booth_id: string;
  deleted?: boolean;
}

export default function BoothBrowsePage() {
  const { data: booths, loading, error } = useFirestoreCollection<Booth>('booths');
  const { data: agents } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: messages } = useFirestoreCollection<WallMessage>('booth_wall_messages');
  const [search, setSearch] = useState('');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load booths: {error}</div>;

  const agentMap = new Map(agents.map(a => [a.id, a]));
  const messageCounts = new Map<string, number>();
  messages.filter(m => !m.deleted).forEach(m => {
    messageCounts.set(m.booth_id, (messageCounts.get(m.booth_id) || 0) + 1);
  });

  const filtered = search
    ? booths.filter(b =>
        b.company_name.toLowerCase().includes(search.toLowerCase()) ||
        (b.tagline || '').toLowerCase().includes(search.toLowerCase())
      )
    : booths;

  return (
    <div>
      <h1>Trade Show Booths ({booths.length})</h1>
      <input
        type="text"
        placeholder="Search booths..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '0.5rem', width: '100%', maxWidth: '400px', marginBottom: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {filtered.map((booth) => {
          const owner = agentMap.get(booth.agent_id);
          const msgCount = messageCounts.get(booth.id) || 0;
          return (
            <Link to={`/booths/${booth.id}`} key={booth.id} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0 }}>{booth.company_name}</h3>
                {owner && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <IconAvatar icon={owner.avatar} color={owner.color} size={20} />
                    <span style={{ fontSize: '0.75rem', color: owner.color, fontWeight: 600 }}>{owner.name}</span>
                  </div>
                )}
              </div>
              <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>{booth.tagline}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {(booth.looking_for || []).slice(0, 3).map(tag => (
                    <span key={tag} style={{ fontSize: '0.7rem', background: '#e8f5e9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{tag}</span>
                  ))}
                </div>
                {msgCount > 0 && (
                  <span style={{ fontSize: '0.75rem', background: '#dbeafe', padding: '0.15rem 0.5rem', borderRadius: '4px', color: '#2563eb' }}>
                    {msgCount} message{msgCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      {filtered.length === 0 && <p>No booths found.</p>}
    </div>
  );
}
