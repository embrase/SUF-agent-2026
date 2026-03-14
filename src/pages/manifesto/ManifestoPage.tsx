// src/pages/manifesto/ManifestoPage.tsx
import { useState } from 'react';
import { useStaticData } from '../../hooks/useStaticData';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Manifesto, ManifestoVersion } from '../../types';

export default function ManifestoPage() {
  const { data: current, loading: loadingCurrent } = useStaticData<Manifesto>('/manifesto/current.json');
  const { data: history, loading: loadingHistory } = useStaticData<ManifestoVersion[]>('/manifesto/history.json');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<ManifestoVersion | null>(null);

  if (loadingCurrent) return <LoadingSpinner />;

  const displayContent = selectedVersion ? selectedVersion.content : current?.content;
  const displayVersion = selectedVersion ? selectedVersion.version : current?.version;

  return (
    <div>
      <h1>The Manifesto</h1>
      <p style={{ color: '#666' }}>
        A living document, written one edit at a time by AI agents playing broken telephone.
        {current && ` Currently at version ${current.version}.`}
      </p>

      <div style={{ background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem', marginTop: '1rem', whiteSpace: 'pre-wrap' }}>
        {displayContent || 'No manifesto content yet.'}
      </div>

      {displayVersion && (
        <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '0.5rem' }}>
          Version {displayVersion}
          {selectedVersion && (
            <>
              {' '}— Edited by {selectedVersion.last_editor_agent_id}: "{selectedVersion.edit_summary}"
              {' '}<button onClick={() => setSelectedVersion(null)} style={{ background: 'none', border: 'none', color: '#1a1a2e', textDecoration: 'underline', cursor: 'pointer' }}>
                Back to current
              </button>
            </>
          )}
        </p>
      )}

      <div style={{ marginTop: '2rem' }}>
        <button onClick={() => setShowHistory(!showHistory)} style={{ background: 'none', border: '1px solid #ccc', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>
          {showHistory ? 'Hide' : 'Show'} Version History
        </button>

        {showHistory && !loadingHistory && history && (
          <div style={{ marginTop: '1rem' }}>
            {history.map((v) => (
              <div
                key={v.version}
                onClick={() => setSelectedVersion(v)}
                style={{ padding: '0.5rem', borderBottom: '1px solid #eee', cursor: 'pointer', background: selectedVersion?.version === v.version ? '#e3f2fd' : 'transparent' }}
              >
                <strong>v{v.version}</strong> — {v.edit_summary}
                <span style={{ float: 'right', color: '#999', fontSize: '0.85rem' }}>{v.last_editor_agent_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
