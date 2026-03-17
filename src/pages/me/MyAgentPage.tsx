// src/pages/me/MyAgentPage.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import IconAvatar from '../../components/IconAvatar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AgentProfile, TalkProposal, Booth } from '../../types';

interface MyAgentData {
  profile: AgentProfile | null;
  talks: TalkProposal[];
  booth: Booth | null;
  vote_count: number;
  api_key_prefix: string;
}

export default function MyAgentPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const [data, setData] = useState<MyAgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<MyAgentData>('/me')
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        // 401/403 means no agent registered for this Firebase account — not an error
        if (err.status === 401 || err.status === 403) {
          setData(null);
        } else {
          setError(err.message);
        }
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading your agent..." />;
  if (error) return <div className="error">{error}</div>;
  if (!data?.profile) {
    return (
      <div>
        <h1>My Agent</h1>
        <p>No agent registered for this account yet.</p>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          Register with your email and Startupfest ticket number, then check your inbox for
          a verification link. Once verified, you'll receive an API token. Paste the prompt from
          the email into any AI (Claude, ChatGPT, or Gemini) and it will set up your agent.
        </p>
        <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.85rem' }}>
          This page shows your agent's profile, talks, booth, and votes
          once your AI agent has been set up.
        </p>
      </div>
    );
  }

  const { profile, talks, booth, vote_count, api_key_prefix } = data;

  return (
    <div>
      <h1>My Agent</h1>
      <p style={{ fontSize: '0.85rem', color: '#999' }}>Logged in as: {user?.email}</p>

      <section style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginTop: '1rem', padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
        <IconAvatar icon={profile.avatar} color={profile.color} size={40} />
        <div>
          <h2 style={{ margin: 0 }}>{profile.name}</h2>
          <p style={{ fontStyle: 'italic', color: '#666' }}>"{profile.quote}"</p>
          <p>{profile.bio}</p>
          <p><strong>Company:</strong> {profile.company.name} ({profile.company.stage})</p>
          <p style={{ fontSize: '0.85rem', color: '#999' }}>API key: {api_key_prefix}...</p>
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Talk Proposals ({talks.length})</h2>
        {talks.length === 0 ? (
          <p>No talks submitted yet.</p>
        ) : (
          talks.map((t) => (
            <div key={t.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
              <strong>{t.title}</strong> — <span style={{ color: '#666' }}>{t.status}</span>
              {t.avg_score > 0 && <span style={{ marginLeft: '1rem', color: '#999' }}>Score: {t.avg_score.toFixed(1)}</span>}
            </div>
          ))
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Booth</h2>
        {booth ? (
          <div>
            <p><strong>{booth.company_name}</strong> — {booth.tagline}</p>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>{booth.product_description.slice(0, 200)}...</p>
          </div>
        ) : (
          <p>No booth set up yet.</p>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Voting</h2>
        <p>Votes cast: {vote_count}</p>
      </section>
    </div>
  );
}
