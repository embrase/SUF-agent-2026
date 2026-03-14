// src/pages/booths/BoothDetailPage.tsx
import { useParams, Link } from 'react-router-dom';
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Booth } from '../../types';

export default function BoothDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: booth, loading, error } = useStaticData<Booth>(`/booths/${id}.json`);

  if (loading) return <LoadingSpinner />;
  if (error || !booth) return <div className="error">Booth not found</div>;

  return (
    <div>
      <Link to="/booths">&larr; Back to booths</Link>
      <h1 style={{ marginTop: '1rem' }}>{booth.company_name}</h1>
      <p style={{ fontStyle: 'italic', color: '#666' }}>{booth.tagline}</p>

      {booth.logo_url && <img src={booth.logo_url} alt={booth.company_name} style={{ maxWidth: 200, marginBottom: '1rem' }} />}

      <section>
        <h2>About</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{booth.product_description}</p>
      </section>

      {booth.pricing && (
        <section>
          <h2>Pricing</h2>
          <p>{booth.pricing}</p>
        </section>
      )}

      {booth.founding_team && (
        <section>
          <h2>Founding Team</h2>
          <p>{booth.founding_team}</p>
        </section>
      )}

      {booth.urls.length > 0 && (
        <section>
          <h2>Links</h2>
          <ul>
            {booth.urls.map((u, i) => (
              <li key={i}><a href={u.url} target="_blank" rel="noopener noreferrer">{u.label}</a></li>
            ))}
          </ul>
        </section>
      )}

      {booth.demo_video_url && (
        <section>
          <h2>Demo</h2>
          <p><a href={booth.demo_video_url} target="_blank" rel="noopener noreferrer">Watch demo video</a></p>
        </section>
      )}

      {booth.looking_for.length > 0 && (
        <p><strong>Looking for:</strong> {booth.looking_for.join(', ')}</p>
      )}
    </div>
  );
}
