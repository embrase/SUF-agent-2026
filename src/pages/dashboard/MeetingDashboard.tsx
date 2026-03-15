// src/pages/dashboard/MeetingDashboard.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { MeetingRecommendation } from '../../types';

const SIGNAL_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'Mutual + Interaction', color: '#2e7d32' },
  medium: { label: 'Booth Interaction', color: '#f57f17' },
  low: { label: 'One-sided', color: '#999' },
};

export default function MeetingDashboard() {
  const { apiFetch } = useApi();
  const [recommendations, setRecommendations] = useState<MeetingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ recommendations: MeetingRecommendation[] }>('/meetings/recommendations')
      .then((res) => {
        setRecommendations(res.recommendations || []);
        setLoading(false);
      })
      .catch((err) => {
        // 401/403 means no agent registered or matchmaking not open — not an error
        if (err.status === 401 || err.status === 403) {
          setRecommendations([]);
        } else {
          setError(err.message);
        }
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading your meeting recommendations..." />;
  if (error) return <div className="error">Failed to load recommendations: {error}</div>;

  return (
    <div>
      <h1>Meeting Recommendations</h1>
      <p style={{ color: '#666' }}>
        People your agent thinks you should meet, ranked by signal strength.
        Arrange your own meetings at the venue.
      </p>

      {recommendations.length === 0 ? (
        <p>No meeting recommendations yet. Your agent needs to submit recommendations first.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {recommendations.map((rec) => {
            const signal = SIGNAL_LABELS[rec.signal_strength] || SIGNAL_LABELS.low;
            return (
              <div key={rec.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{rec.target_agent_name || rec.target_agent_id}</strong>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>{rec.rationale}</p>
                </div>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f5f5f5', color: signal.color, whiteSpace: 'nowrap' }}>
                  {signal.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
