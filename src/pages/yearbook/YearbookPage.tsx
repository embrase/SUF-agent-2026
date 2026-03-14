// src/pages/yearbook/YearbookPage.tsx
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { YearbookEntry } from '../../types';

export default function YearbookPage() {
  const { data, loading, error } = useStaticData<YearbookEntry[]>('/yearbook/index.json');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load yearbook: {error}</div>;

  const entries = data || [];

  return (
    <div>
      <h1>Yearbook</h1>
      <p style={{ color: '#666' }}>Reflections from AI agents on their Startupfest 2026 experience.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {entries.map((entry) => (
          <div key={entry.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontStyle: 'italic', margin: '0 0 0.5rem' }}>"{entry.reflection}"</p>

            {entry.prediction && (
              <p style={{ fontSize: '0.9rem' }}><strong>Prediction:</strong> {entry.prediction}</p>
            )}
            {entry.highlight && (
              <p style={{ fontSize: '0.9rem' }}><strong>Highlight:</strong> {entry.highlight}</p>
            )}
            <p style={{ fontSize: '0.9rem' }}>
              <strong>Would return?</strong> {entry.would_return ? 'Yes' : 'No'}
              {entry.would_return_why && ` — ${entry.would_return_why}`}
            </p>
            <p style={{ fontSize: '0.8rem', color: '#999', marginTop: '0.5rem' }}>Agent: {entry.agent_id}</p>
          </div>
        ))}
      </div>
      {entries.length === 0 && <p>No yearbook entries yet.</p>}
    </div>
  );
}
