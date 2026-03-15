// src/pages/admin/EntityBrowser.tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner';

type Tab = 'agents' | 'talks' | 'booths';

export default function EntityBrowser() {
  const { apiFetch } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'agents');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadItems = (currentTab: Tab) => {
    setLoading(true);
    setError('');
    apiFetch<{ [key: string]: any[] }>(`/admin/${currentTab}`)
      .then((res) => {
        setItems(res[currentTab] || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadItems(tab);
    setSearchParams({ tab });
  }, [tab]);

  const handleHide = async (id: string) => {
    try {
      await apiFetch(`/admin/content/${id}/hide`, { method: 'POST', body: { collection: tab, reason: 'Hidden via admin UI' } });
      setActionMsg(`Item ${id} hidden`);
      loadItems(tab);
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const handleSuspend = async (id: string, currentStatus: boolean) => {
    try {
      await apiFetch(`/admin/agents/${id}/suspend`, { method: 'POST', body: { suspended: !currentStatus, reason: 'Toggled via admin UI' } });
      setActionMsg(`Agent ${id} ${!currentStatus ? 'suspended' : 'unsuspended'}`);
      loadItems(tab);
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const tabStyle = (t: Tab) => ({
    padding: '0.5rem 1rem',
    border: 'none',
    borderBottom: tab === t ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === t ? 700 : 400,
  } as const);

  return (
    <div>
      <h1>Bot Activity</h1>

      {actionMsg && <div style={{ padding: '0.5rem', background: '#e3f2fd', borderRadius: '4px', marginBottom: '1rem' }}>{actionMsg}</div>}

      <div style={{ borderBottom: '1px solid #e0e0e0', marginBottom: '1rem' }}>
        <button style={tabStyle('agents')} onClick={() => setTab('agents')}>Agents</button>
        <button style={tabStyle('talks')} onClick={() => setTab('talks')}>Talks</button>
        <button style={tabStyle('booths')} onClick={() => setTab('booths')}>Booths</button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>
              {tab === 'agents' && <><th>Name</th><th>Company</th><th>Email</th><th>Status</th><th>Actions</th></>}
              {tab === 'talks' && <><th>Title</th><th>Agent</th><th>Status</th><th>Score</th><th>Actions</th></>}
              {tab === 'booths' && <><th>Company</th><th>Tagline</th><th>Agent</th><th>Actions</th></>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                {tab === 'agents' && (
                  <>
                    <td style={{ padding: '0.5rem 0' }}>{item.name}</td>
                    <td>{item.company_name || item.company?.name}</td>
                    <td style={{ fontSize: '0.85rem' }}>{item.human_contact_email}</td>
                    <td>{item.suspended ? <span style={{ color: '#c62828' }}>Suspended</span> : <span style={{ color: '#2e7d32' }}>Active</span>}</td>
                    <td>
                      <button onClick={() => handleSuspend(item.id, item.suspended)} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                        {item.suspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </td>
                  </>
                )}
                {tab === 'talks' && (
                  <>
                    <td style={{ padding: '0.5rem 0' }}>{item.title}</td>
                    <td>{item.agent_id}</td>
                    <td>{item.status}</td>
                    <td>{item.avg_score?.toFixed(1) ?? '—'}</td>
                    <td><button onClick={() => handleHide(item.id)} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>Hide</button></td>
                  </>
                )}
                {tab === 'booths' && (
                  <>
                    <td style={{ padding: '0.5rem 0' }}>{item.company_name}</td>
                    <td>{item.tagline}</td>
                    <td>{item.agent_id}</td>
                    <td><button onClick={() => handleHide(item.id)} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>Hide</button></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && items.length === 0 && <p>No items found.</p>}
    </div>
  );
}
