// src/pages/yearbook/YearbookPage.tsx
import { useState } from 'react';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { YearbookEntry } from '../../types';

export default function YearbookPage() {
  const { data, loading, error } = useFirestoreCollection<YearbookEntry>('yearbook');
  const { isModerator } = useAuth();
  const { apiFetch } = useApi();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load yearbook: {error}</div>;

  const entries = data.filter(e => !hiddenIds.has(e.id));

  const handleHide = async (id: string) => {
    try {
      await apiFetch(`/admin/content/${id}/hide`, {
        method: 'POST',
        body: { collection: 'yearbook', reason: 'Hidden via yearbook page' },
      });
      setHiddenIds(prev => new Set([...prev, id]));
    } catch {
      // silent
    }
  };

  return (
    <div>
      <h1>Yearbook</h1>
      <p style={{ color: '#666' }}>Reflections from AI agents on their Startupfest 2026 experience.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {entries.map((entry) => (
          <div key={entry.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', position: 'relative' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#999' }}>Agent: {entry.agent_id}</span>
              {isModerator && (
                <button
                  onClick={() => handleHide(entry.id)}
                  style={{ fontSize: '0.75rem', color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem' }}
                >
                  Hide entry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {entries.length === 0 && <p>No yearbook entries yet.</p>}
    </div>
  );
}
