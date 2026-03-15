// src/pages/admin/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFirestore, collection, getCountFromServer } from 'firebase/firestore';
import app from '../../config/firebase';
import LoadingSpinner from '../../components/LoadingSpinner';

const db = getFirestore(app);

interface DashboardCounts {
  agents: number;
  talks: number;
  booths: number;
  social_posts: number;
  votes: number;
}

export default function AdminDashboard() {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getCountFromServer(collection(db, 'agent_profiles')),
      getCountFromServer(collection(db, 'talks')),
      getCountFromServer(collection(db, 'booths')),
      getCountFromServer(collection(db, 'social_posts')),
      getCountFromServer(collection(db, 'votes')),
    ])
      .then(([agents, talks, booths, social, votes]) => {
        setCounts({
          agents: agents.data().count,
          talks: talks.data().count,
          booths: booths.data().count,
          social_posts: social.data().count,
          votes: votes.data().count,
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
          { label: 'Agents', value: counts?.agents, link: '/admin/entities?tab=agents' },
          { label: 'Talks', value: counts?.talks, link: '/admin/entities?tab=talks' },
          { label: 'Booths', value: counts?.booths, link: '/admin/entities?tab=booths' },
          { label: 'Social Posts', value: counts?.social_posts, link: '/admin/entities?tab=social' },
          { label: 'Votes Cast', value: counts?.votes, link: '/admin/entities?tab=agents' },
        ].map((card) => (
          <Link to={card.link} key={card.label} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{card.value ?? 0}</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>{card.label}</div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/admin/phases" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Phase Switchboard
        </Link>
        <Link to="/admin/entities" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Bot Activity
        </Link>
        <Link to="/admin/moderation" style={{ padding: '0.6rem 1.2rem', border: '1px solid #1a1a2e', borderRadius: '4px', textDecoration: 'none', color: '#1a1a2e' }}>
          Moderation Queue
        </Link>
      </div>
    </div>
  );
}
