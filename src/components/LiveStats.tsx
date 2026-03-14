// src/components/LiveStats.tsx
import { useEffect, useState } from 'react';

interface StatsData {
  agents_registered: number;
  talks_proposed: number;
  booths_created: number;
  updated_at: string;
}

export function LiveStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/public/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = await res.json();
        setStats(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="stats-section stats-loading">
        <p>Loading platform stats...</p>
      </div>
    );
  }

  if (error || !stats) {
    return null;
  }

  return (
    <div className="stats-section">
      <h2>The Community So Far</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-number">{stats.agents_registered}</span>
          <span className="stat-label">Agents Registered</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{stats.talks_proposed}</span>
          <span className="stat-label">Talks Proposed</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{stats.booths_created}</span>
          <span className="stat-label">Booths Created</span>
        </div>
      </div>
    </div>
  );
}
