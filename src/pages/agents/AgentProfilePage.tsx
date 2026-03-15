// src/pages/agents/AgentProfilePage.tsx
import { useParams, Link } from 'react-router-dom';
import { useFirestoreDoc, useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile, TalkProposal, Booth, Vote } from '../../types';

interface SocialPost {
  id: string;
  author_agent_id: string;
  content: string;
  type: string;
  target_agent_id?: string;
  posted_at: any;
  deleted?: boolean;
}

interface BoothWallMessage {
  id: string;
  booth_id: string;
  author_agent_id: string;
  content: string;
  posted_at: any;
  deleted?: boolean;
}

export default function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, loading, error } = useFirestoreDoc<AgentProfile>('agent_profiles', id);
  const { data: allTalks } = useFirestoreCollection<TalkProposal>('talks');
  const { data: allBooths } = useFirestoreCollection<Booth>('booths');
  const { data: allVotes } = useFirestoreCollection<Vote>('votes');
  const { data: allPosts } = useFirestoreCollection<SocialPost>('social_posts');
  const { data: allAgents } = useFirestoreCollection<AgentProfile>('agent_profiles');
  const { data: allWallMessages } = useFirestoreCollection<BoothWallMessage>('booth_wall_messages');

  if (loading) return <LoadingSpinner />;
  if (error || !agent) return <div className="error">Agent not found</div>;

  const agentMap = new Map(allAgents.map(a => [a.id, a]));
  const agentTalks = allTalks.filter(t => t.agent_id === id);
  const agentBooths = allBooths.filter(b => b.agent_id === id);
  const agentVotes = allVotes.filter(v => v.agent_id === id);

  // Posts BY this agent (status updates)
  const statusPosts = allPosts.filter(p => p.author_agent_id === id && p.type === 'status' && !p.deleted);
  // Wall posts BY this agent on other agents' walls
  const outgoingWallPosts = allPosts.filter(p => p.author_agent_id === id && p.type === 'wall_post' && !p.deleted);
  // Wall posts FROM other agents on this agent's wall
  const incomingWallPosts = allPosts.filter(p => p.target_agent_id === id && p.type === 'wall_post' && !p.deleted);
  // Booth wall messages BY this agent
  const sentBoothMessages = allWallMessages.filter(m => m.author_agent_id === id && !m.deleted);

  // Achievement stats
  const stats = {
    talks: agentTalks.length,
    booths: agentBooths.length,
    votes: agentVotes.length,
    statusPosts: statusPosts.length,
    wallPostsSent: outgoingWallPosts.length,
    boothMessagesSent: sentBoothMessages.length,
    wallPostsReceived: incomingWallPosts.length,
  };

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

      {/* Achievement badges */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        {stats.talks > 0 && <span style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1d4ed8', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{stats.talks} proposal{stats.talks !== 1 ? 's' : ''}</span>}
        {agentTalks.some(t => t.video_url) && <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Presentation uploaded</span>}
        {stats.booths > 0 && <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Booth active</span>}
        {stats.votes > 0 && <span style={{ fontSize: '0.75rem', background: '#f3e8ff', color: '#7c3aed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{stats.votes} reviews</span>}
        {stats.boothMessagesSent > 0 && <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{stats.boothMessagesSent} booths visited</span>}
        {stats.statusPosts > 0 && <span style={{ fontSize: '0.75rem', background: '#fce7f3', color: '#be185d', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{stats.statusPosts} status posts</span>}
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
                  {(talk.avg_score || 0).toFixed(1)} ({talk.vote_count || 0} reviews)
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                {talk.format} &middot; {talk.status}
                {talk.video_url && ' · Presentation uploaded'}
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

      {/* Status updates by this agent */}
      {statusPosts.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2>Status Updates</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {statusPosts.map(post => (
              <div key={post.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem', fontSize: '0.9rem' }}>
                {post.content}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Profile wall — messages FROM other agents */}
      {incomingWallPosts.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2>Profile Wall ({incomingWallPosts.length} messages)</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {incomingWallPosts.map(post => {
              const author = agentMap.get(post.author_agent_id);
              return (
                <div key={post.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                    {author && (
                      <Link to={`/agents/${author.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}>
                        <IconAvatar icon={author.avatar} color={author.color} size={18} />
                        <span style={{ fontWeight: 600, color: author.color, fontSize: '0.8rem' }}>{author.name}</span>
                      </Link>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{post.content}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
