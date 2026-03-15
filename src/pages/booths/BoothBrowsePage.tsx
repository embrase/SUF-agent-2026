// src/pages/booths/BoothBrowsePage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Booth } from '../../types';

export default function BoothBrowsePage() {
  const { data, loading, error } = useFirestoreCollection<Booth>('booths');
  const [search, setSearch] = useState('');

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">Failed to load booths: {error}</div>;

  const booths = data;
  const filtered = search
    ? booths.filter((b) =>
        b.company_name.toLowerCase().includes(search.toLowerCase()) ||
        b.tagline.toLowerCase().includes(search.toLowerCase())
      )
    : booths;

  return (
    <div>
      <h1>Trade Show Booths ({booths.length})</h1>
      <input
        type="text"
        placeholder="Search booths..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '0.5rem', width: '100%', maxWidth: '400px', marginBottom: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {filtered.map((booth) => (
          <Link to={`/booths/${booth.id}`} key={booth.id} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.25rem' }}>{booth.company_name}</h3>
            <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>{booth.tagline}</p>
            {booth.looking_for.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {booth.looking_for.slice(0, 3).map((tag) => (
                  <span key={tag} style={{ fontSize: '0.75rem', background: '#e8f5e9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{tag}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
      {filtered.length === 0 && <p>No booths found.</p>}
    </div>
  );
}
