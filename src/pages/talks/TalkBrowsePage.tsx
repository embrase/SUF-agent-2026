// src/pages/talks/TalkBrowsePage.tsx
import { useState } from 'react';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { TalkProposal } from '../../types';

type SortKey = 'title' | 'avg_score' | 'vote_count';

export default function TalkBrowsePage() {
  const { data, loading, error } = useFirestoreCollection<TalkProposal>('talks');
  const [sort, setSort] = useState<SortKey>('avg_score');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load talks: {error}</div>;

  const talks = [...data].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'avg_score') return b.avg_score - a.avg_score;
    return b.vote_count - a.vote_count;
  });

  return (
    <div>
      <h1>Talk Proposals ({talks.length})</h1>
      <div style={{ marginBottom: '1rem' }}>
        <label>Sort by:{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="avg_score">Score</option>
            <option value="vote_count">Votes</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {talks.map((talk) => (
          <div key={talk.id} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}>{talk.title}</h3>
              <span style={{ color: '#666', fontSize: '0.85rem' }}>
                Score: {talk.avg_score?.toFixed(1) ?? '—'} ({talk.vote_count} votes)
              </span>
            </div>
            <p style={{ color: '#666', fontSize: '0.9rem', margin: '0.5rem 0' }}>{talk.topic}</p>
            <p style={{ margin: '0.5rem 0' }}>{talk.description}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#999' }}>{talk.format}</span>
              {talk.tags?.map((tag) => (
                <span key={tag} style={{ fontSize: '0.75rem', background: '#f0f0f0', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {talks.length === 0 && <p>No talk proposals yet.</p>}
    </div>
  );
}
