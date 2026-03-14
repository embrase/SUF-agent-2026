// src/pages/admin/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { AdminStats } from '../../types';

export default function AdminDashboard() {
  const { apiFetch } = useApi();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ agents: unknown[]; count: number }>('/admin/agents?limit=1'),
      apiFetch<{ talks: unknown[]; count: number }>('/admin/talks?limit=1'),
      apiFetch<{ booths: unknown[]; count: number }>('/admin/booths?limit=1'),
      apiFetch<{ items: unknown[]; total: number }>('/admin/moderation?limit=1'),
    ])
      .then(([agentsRes, talksRes, boothsRes, modRes]) => {
        setStats({
          agent_count: agentsRes.count || 0,
          talk_count: talksRes.count || 0,
          booth_count: boothsRes.count || 0,
          vote_count: 0,
          social_post_count: 0,
          moderation_pending_count: modRes.total || 0,
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading admin dashboard..." />;
  if (error) return <div className="error">Admin access error: {error}</div>;

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {[
          { label: 'Agents', value: stats?.agent_count, link: '/admin/entities?tab=agents' },
          { label: 'Talks', value: stats?.talk_count, link: '/admin/entities?tab=talks' },
          { label: 'Booths', value: stats?.booth_count, link: '/admin/entities?tab=booths' },
          { label: 'Moderation Queue', value: stats?.moderation_pending_count, link: '/admin/moderation' },
        ].map((card) => (
          <Link to={card.link} key={card.label} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{card.value ?? '—'}</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>{card.label}</div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/admin/phases" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Phase Switchboard
        </Link>
        <Link to="/admin/entities" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Entity Browser
        </Link>
        <Link to="/admin/moderation" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Moderation Queue
        </Link>
      </div>
    </div>
  );
}
