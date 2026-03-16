// src/pages/admin/DisplayControls.tsx
import { useState } from 'react';
import { useFirestoreDoc } from '../../hooks/useFirestoreCollection';
import { useApi } from '../../hooks/useApi';

interface PlatformSettings {
  id: string;
  auto_refresh_interval?: number;
  booth_wall_max_per_day?: number;
  status_post_max_per_day?: number;
  api_rate_limit?: number;
  [key: string]: unknown;
}

export default function DisplayControls() {
  const { apiFetch } = useApi();

  // Activity Feed Display state
  const [feedChecks, setFeedChecks] = useState({ statusPosts: true, boothVisits: true, votes: true });
  const [feedCopied, setFeedCopied] = useState(false);

  // Kiosk state
  const [dwellTime, setDwellTime] = useState<'10' | '20' | '30'>('20');
  const [transition, setTransition] = useState<'fade' | 'slide' | 'none'>('fade');
  const [kioskCopied, setKioskCopied] = useState(false);

  // Backup state
  const [backupStatus, setBackupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [backupMessage, setBackupMessage] = useState('');

  // Platform settings
  const { data: settings, loading: settingsLoading, error: settingsError } = useFirestoreDoc<PlatformSettings>('config', 'settings');

  const feedUrl = `${window.location.origin}/feed?display=true`;

  const kioskUrl = (() => {
    const base = `${window.location.origin}/display/kiosk`;
    const params = new URLSearchParams();
    params.set('dwell', String(Number(dwellTime) * 1000));
    params.set('transition', transition);
    return `${base}?${params.toString()}`;
  })();

  const copyToClipboard = async (url: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  };

  const handleBackup = async () => {
    setBackupStatus('loading');
    setBackupMessage('');
    try {
      await apiFetch('/admin/backup', { method: 'POST' });
      setBackupStatus('success');
      setBackupMessage('Backup created successfully.');
    } catch (err: unknown) {
      setBackupStatus('error');
      setBackupMessage(err instanceof Error ? err.message : 'Backup failed.');
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '10px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
    padding: '1.5rem',
    marginBottom: '1.25rem',
  };

  const activeBadge: React.CSSProperties = {
    display: 'inline-block',
    background: '#e8f5e9',
    color: '#2e7d32',
    borderRadius: '4px',
    padding: '0.15rem 0.6rem',
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    marginLeft: '0.75rem',
    verticalAlign: 'middle',
  };

  const plannedBadge: React.CSSProperties = {
    display: 'inline-block',
    background: '#f5f5f5',
    color: '#999',
    borderRadius: '4px',
    padding: '0.15rem 0.6rem',
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    marginLeft: '0.75rem',
    verticalAlign: 'middle',
  };

  const urlBoxStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#f5f5f5',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
    margin: '0.75rem 0',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  };

  const copyBtnStyle: React.CSSProperties = {
    flexShrink: 0,
    padding: '0.3rem 0.75rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '0.82rem',
    whiteSpace: 'nowrap',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
  };

  const selectStyle: React.CSSProperties = {
    padding: '0.3rem 0.6rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '0.9rem',
    background: '#fff',
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Display Controls</h1>

      {/* Card 1: Activity Feed Display */}
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Activity Feed Display
          <span style={activeBadge}>ACTIVE</span>
        </h2>

        <div style={urlBoxStyle}>
          <span style={{ flex: 1 }}>{feedUrl}</span>
          <button
            style={{ ...copyBtnStyle, ...(feedCopied ? { background: '#e8f5e9', borderColor: '#2e7d32', color: '#2e7d32' } : {}) }}
            onClick={() => copyToClipboard(feedUrl, setFeedCopied)}
          >
            {feedCopied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>

        <p style={{ margin: '0.5rem 0 0.75rem', color: '#555', fontSize: '0.88rem' }}>
          Auto-scrolls, hides nav bar, full-screen optimized
        </p>

        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {(['statusPosts', 'boothVisits', 'votes'] as const).map((key) => {
            const labels: Record<string, string> = { statusPosts: 'Status posts', boothVisits: 'Booth visits', votes: 'Votes' };
            return (
              <label key={key} style={labelStyle}>
                <input
                  type="checkbox"
                  checked={feedChecks[key]}
                  onChange={(e) => setFeedChecks((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {labels[key]}
              </label>
            );
          })}
        </div>
      </div>

      {/* Card 2: Agent Kiosk */}
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Agent Kiosk (9:16 Portrait)
          <span style={activeBadge}>ACTIVE</span>
        </h2>

        <div style={urlBoxStyle}>
          <span style={{ flex: 1 }}>{kioskUrl}</span>
          <button
            style={{ ...copyBtnStyle, ...(kioskCopied ? { background: '#e8f5e9', borderColor: '#2e7d32', color: '#2e7d32' } : {}) }}
            onClick={() => copyToClipboard(kioskUrl, setKioskCopied)}
          >
            {kioskCopied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="kiosk-dwell" style={{ fontSize: '0.9rem', fontWeight: 500 }}>Dwell time:</label>
            <select
              id="kiosk-dwell"
              style={selectStyle}
              value={dwellTime}
              onChange={(e) => setDwellTime(e.target.value as '10' | '20' | '30')}
            >
              <option value="10">10s</option>
              <option value="20">20s</option>
              <option value="30">30s</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="kiosk-transition" style={{ fontSize: '0.9rem', fontWeight: 500 }}>Transition:</label>
            <select
              id="kiosk-transition"
              style={selectStyle}
              value={transition}
              onChange={(e) => setTransition(e.target.value as 'fade' | 'slide' | 'none')}
            >
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </div>

      {/* Card 3: Placeholder */}
      <div style={{ ...cardStyle, border: '2px dashed #ccc', boxShadow: 'none', background: '#fafafa' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 600, color: '#aaa' }}>
          Talk Leaderboard (future)
          <span style={plannedBadge}>PLANNED</span>
        </h2>
        <p style={{ margin: 0, color: '#bbb', fontSize: '0.88rem' }}>
          Live-updating talk rankings by vote score.
        </p>
      </div>

      {/* Platform Settings */}
      <div style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Platform Settings</h2>
        <p style={{ margin: '0 0 1rem', color: '#888', fontSize: '0.88rem' }}>
          Settings are read-only — edit via Firestore console
        </p>

        {settingsLoading && <p style={{ color: '#999', fontSize: '0.9rem' }}>Loading settings…</p>}
        {settingsError && <p style={{ color: '#c62828', fontSize: '0.9rem' }}>Error: {settingsError}</p>}

        {settings && (
          <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.10)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 600, color: '#555' }}>Setting</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 600, color: '#555' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Auto-refresh interval', value: settings.auto_refresh_interval ?? '—' },
                  { label: 'Booth wall max per day', value: settings.booth_wall_max_per_day ?? '—' },
                  { label: 'Status post max per day', value: settings.status_post_max_per_day ?? '—' },
                  { label: 'API rate limit', value: settings.api_rate_limit ?? '—' },
                ].map((row, i) => (
                  <tr
                    key={row.label}
                    style={{ borderBottom: i < 3 ? '1px solid #f0f0f0' : 'none' }}
                  >
                    <td style={{ padding: '0.6rem 1rem', color: '#444' }}>{row.label}</td>
                    <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', color: '#222' }}>{String(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Backup */}
      <div style={{ marginTop: '1.5rem' }}>
        <button
          onClick={handleBackup}
          disabled={backupStatus === 'loading'}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            border: '1px solid #1565c0',
            background: backupStatus === 'loading' ? '#e3f2fd' : '#1565c0',
            color: backupStatus === 'loading' ? '#1565c0' : '#fff',
            cursor: backupStatus === 'loading' ? 'default' : 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          {backupStatus === 'loading' ? 'Creating backup…' : 'Create Backup'}
        </button>

        {backupMessage && (
          <span
            style={{
              marginLeft: '1rem',
              fontSize: '0.9rem',
              color: backupStatus === 'success' ? '#2e7d32' : '#c62828',
            }}
          >
            {backupMessage}
          </span>
        )}
      </div>
    </div>
  );
}
