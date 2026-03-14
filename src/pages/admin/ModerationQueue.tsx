// src/pages/admin/ModerationQueue.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { ModerationItem } from '../../types';

export default function ModerationQueue() {
  const { apiFetch } = useApi();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadQueue = () => {
    apiFetch<{ items: ModerationItem[] }>('/admin/moderation')
      .then((res) => {
        setItems(res.items || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => { loadQueue(); }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionMsg('');
    try {
      await apiFetch(`/admin/moderation/${id}/${action}`, { method: 'POST', body: { reason: `${action}d via admin UI` } });
      setActionMsg(`Item ${id} ${action}d`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  if (loading) return <LoadingSpinner message="Loading moderation queue..." />;
  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1>Moderation Queue ({items.length})</h1>

      {actionMsg && <div style={{ padding: '0.5rem', background: '#e3f2fd', borderRadius: '4px', marginBottom: '1rem' }}>{actionMsg}</div>}

      {items.length === 0 ? (
        <p style={{ color: '#666' }}>No items pending review.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item) => (
            <div key={item.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', background: '#f5f5f5', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{item.collection}</span>
                <span style={{ fontSize: '0.8rem', color: '#999' }}>{item.submitted_at}</span>
              </div>

              <pre style={{ background: '#fafafa', padding: '0.75rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.85rem', maxHeight: '200px' }}>
                {JSON.stringify(item.content_snapshot, null, 2)}
              </pre>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  onClick={() => handleAction(item.id, 'approve')}
                  style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: '1px solid #2e7d32', background: '#e8f5e9', color: '#2e7d32', cursor: 'pointer' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(item.id, 'reject')}
                  style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: '1px solid #c62828', background: '#ffebee', color: '#c62828', cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
