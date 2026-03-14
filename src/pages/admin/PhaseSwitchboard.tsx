// src/pages/admin/PhaseSwitchboard.tsx
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { PhaseState } from '../../types';

export default function PhaseSwitchboard() {
  const { apiFetch } = useApi();
  const { isAdmin } = useAuth();
  const [phases, setPhases] = useState<PhaseState[]>([]);
  const [globalFreeze, setGlobalFreeze] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadPhases = () => {
    apiFetch<{ phases: PhaseState[]; global_write_freeze: boolean }>('/admin/phases')
      .then((res) => {
        setPhases(res.phases);
        setGlobalFreeze(res.global_write_freeze);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => { loadPhases(); }, []);

  const togglePhase = async (key: string, currentlyOpen: boolean) => {
    if (!isAdmin) { setActionMsg('Admin role required to toggle phases'); return; }
    setActionMsg('');
    try {
      await apiFetch(`/admin/phases/${key}`, {
        method: 'POST',
        body: { is_open: !currentlyOpen, reason: 'Manual toggle via UI' },
      });
      setActionMsg(`Phase "${key}" ${!currentlyOpen ? 'opened' : 'closed'}`);
      loadPhases();
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const toggleFreeze = async () => {
    if (!isAdmin) { setActionMsg('Admin role required for global freeze'); return; }
    try {
      await apiFetch('/admin/freeze', {
        method: 'POST',
        body: { freeze: !globalFreeze, reason: 'Manual toggle via UI' },
      });
      setGlobalFreeze(!globalFreeze);
      setActionMsg(globalFreeze ? 'Global freeze lifted' : 'Global freeze activated');
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1>Phase Switchboard</h1>

      {actionMsg && <div style={{ padding: '0.5rem', background: '#e3f2fd', borderRadius: '4px', marginBottom: '1rem' }}>{actionMsg}</div>}

      <div style={{ marginBottom: '2rem', padding: '1rem', border: globalFreeze ? '2px solid #c62828' : '1px solid #e0e0e0', borderRadius: '8px', background: globalFreeze ? '#ffebee' : '#fff' }}>
        <strong>Global Write Freeze:</strong> {globalFreeze ? 'ACTIVE' : 'Off'}
        <button
          onClick={toggleFreeze}
          disabled={!isAdmin}
          style={{ marginLeft: '1rem', padding: '0.3rem 0.8rem', borderRadius: '4px', border: '1px solid #c62828', background: globalFreeze ? '#fff' : '#c62828', color: globalFreeze ? '#c62828' : '#fff', cursor: 'pointer' }}
        >
          {globalFreeze ? 'Lift Freeze' : 'Activate Freeze'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {phases.map((phase) => (
          <div key={phase.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
            <div>
              <strong>{phase.name}</strong>
              <div style={{ fontSize: '0.8rem', color: '#999' }}>
                {phase.override_opens || phase.default_opens} to {phase.override_closes || phase.default_closes}
                {phase.override_is_open !== undefined && <span style={{ marginLeft: '0.5rem', color: '#f57f17' }}>(overridden)</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: phase.computed_is_open ? '#2e7d32' : '#999' }}>
                {phase.computed_is_open ? 'OPEN' : 'CLOSED'}
              </span>
              <button
                onClick={() => togglePhase(phase.key, phase.computed_is_open)}
                disabled={!isAdmin}
                style={{ padding: '0.25rem 0.75rem', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                {phase.computed_is_open ? 'Close' : 'Open'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
