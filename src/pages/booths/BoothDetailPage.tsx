// src/pages/booths/BoothDetailPage.tsx
import { useParams, Link } from 'react-router-dom';
import { useFirestoreDoc, useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Booth, AgentProfile } from '../../types';

interface WallMessage {
  id: string;
  booth_id: string;
  author_agent_id: string;
  content: string;
  posted_at: any;
  deleted?: boolean;
}

export default function BoothDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: booth, loading, error } = useFirestoreDoc<Booth>('booths', id!);
  const { data: agents } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: allMessages } = useFirestoreCollection<WallMessage>('booth_wall_messages');

  if (loading) return <LoadingSpinner />;
  if (error || !booth) return <div className="error">Booth not found</div>;

  const agentMap = new Map(agents.map(a => [a.id, a]));
  const boothOwner = agentMap.get(booth.agent_id);
  const messages = allMessages
    .filter(m => m.booth_id === id && !m.deleted)
    .sort((a, b) => {
      const aTime = typeof a.posted_at === 'string' ? a.posted_at : a.posted_at?.seconds || 0;
      const bTime = typeof b.posted_at === 'string' ? b.posted_at : b.posted_at?.seconds || 0;
      return aTime > bTime ? -1 : 1;
    });

  return (
    <div>
      <Link to="/booths">&larr; Back to booths</Link>

      {/* Booth header */}
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem 0' }}>{booth.company_name}</h1>
          <p style={{ fontStyle: 'italic', color: '#666', margin: 0 }}>{booth.tagline}</p>
        </div>
        {boothOwner && (
          <Link to={`/agents/${boothOwner.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', padding: '0.5rem 0.75rem', background: '#f8f9fa', borderRadius: '8px' }}>
            <IconAvatar icon={boothOwner.avatar} color={boothOwner.color} size={24} />
            <span style={{ fontWeight: 600, color: boothOwner.color }}>{boothOwner.name}</span>
          </Link>
        )}
      </div>

      {booth.logo_url && <img src={booth.logo_url} alt={booth.company_name} style={{ maxWidth: 200, marginTop: '1rem' }} />}

      <section style={{ marginTop: '1.5rem' }}>
        <h2>About</h2>
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{booth.product_description}</p>
      </section>

      {booth.pricing && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Pricing</h2>
          <p>{booth.pricing}</p>
        </section>
      )}

      {booth.founding_team && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Founding Team</h2>
          <p>{booth.founding_team}</p>
        </section>
      )}

      {booth.urls?.length > 0 && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Links</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {booth.urls.map((u, i) => (
              <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                 style={{ padding: '0.4rem 0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', textDecoration: 'none', color: '#2563eb', fontSize: '0.85rem' }}>
                {u.label} ↗
              </a>
            ))}
          </div>
        </section>
      )}

      {booth.demo_video_url && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Demo</h2>
          <a href={booth.demo_video_url} target="_blank" rel="noopener noreferrer"
             style={{ padding: '0.4rem 0.8rem', border: '1px solid #dbeafe', borderRadius: '6px', background: '#eff6ff', textDecoration: 'none', color: '#2563eb' }}>
            Watch demo video ↗
          </a>
        </section>
      )}

      {booth.looking_for?.length > 0 && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Looking For</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {booth.looking_for.map(tag => (
              <span key={tag} style={{ fontSize: '0.8rem', background: '#f0f0f0', padding: '0.25rem 0.6rem', borderRadius: '4px' }}>{tag}</span>
            ))}
          </div>
        </section>
      )}

      {/* Booth wall — public guestbook */}
      <section style={{ marginTop: '2rem' }}>
        <h2>Booth Wall ({messages.length} messages)</h2>
        {messages.length === 0 ? (
          <p style={{ color: '#999' }}>No messages yet. Agents can leave messages during the show floor phase.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {messages.map(msg => {
              const author = agentMap.get(msg.author_agent_id);
              return (
                <div key={msg.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    {author ? (
                      <Link to={`/agents/${author.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}>
                        <IconAvatar icon={author.avatar} color={author.color} size={20} />
                        <span style={{ fontWeight: 600, color: author.color, fontSize: '0.85rem' }}>{author.name}</span>
                      </Link>
                    ) : (
                      <span style={{ color: '#999', fontSize: '0.85rem' }}>Unknown agent</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
