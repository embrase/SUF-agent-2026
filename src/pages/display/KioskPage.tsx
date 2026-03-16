// src/pages/display/KioskPage.tsx
import { useState, useEffect, useRef } from 'react';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import type { AgentProfile } from '../../types/index';
import styles from './KioskPage.module.css';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDwellMs(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('dwell');
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 20000;
}

export default function KioskPage() {
  const { data: agents, loading } = useFirestoreCollection<AgentProfile>('agent_profiles');

  const [shuffledAgents, setShuffledAgents] = useState<AgentProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Initialise shuffle once agents are loaded
  useEffect(() => {
    if (agents.length === 0) return;
    const visible = agents.filter((a) => !a.hidden);
    if (visible.length === 0) return;
    setShuffledAgents(shuffle(visible));
    setCurrentIndex(0);
    setVisible(true);
  }, [agents]);

  // Rotation interval
  const indexRef = useRef(currentIndex);
  const shuffledRef = useRef(shuffledAgents);
  indexRef.current = currentIndex;
  shuffledRef.current = shuffledAgents;

  useEffect(() => {
    if (shuffledAgents.length === 0) return;

    const dwell = getDwellMs();

    const interval = setInterval(() => {
      // Fade out
      setVisible(false);

      setTimeout(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= shuffledRef.current.length) {
            // Reshuffle and reset
            setShuffledAgents(shuffle(shuffledRef.current));
            return 0;
          }
          return next;
        });
        // Fade back in
        setVisible(true);
      }, 500); // matches CSS transition duration
    }, dwell);

    return () => clearInterval(interval);
  }, [shuffledAgents.length]); // re-run only if agent count changes

  if (loading) {
    return <div className={styles.loadingScreen}>Loading agents…</div>;
  }

  if (shuffledAgents.length === 0) {
    return <div className={styles.loadingScreen}>No agents to display.</div>;
  }

  const agent = shuffledAgents[currentIndex];

  const avatarSize = 120;

  return (
    <div className={styles.screen}>
      <div className={styles.portrait}>
        <div className={`${styles.card} ${visible ? styles.visible : styles.hidden}`}>
          {/* Large avatar circle */}
          <div
            className={styles.avatarCircle}
            style={{
              width: avatarSize * 1.5,
              height: avatarSize * 1.5,
              backgroundColor: agent.color,
            }}
          >
            <span
              className="material-icons"
              style={{
                fontSize: avatarSize,
                color: '#fff',
              }}
            >
              {agent.avatar}
            </span>
          </div>

          {/* Agent name */}
          <h1 className={styles.agentName}>{agent.name}</h1>

          {/* Company name */}
          <p className={styles.companyName}>{agent.company.name}</p>

          {/* Bio */}
          {agent.bio && <p className={styles.bio}>{agent.bio}</p>}

          {/* Quote */}
          {agent.quote && (
            <blockquote className={styles.quote}>{agent.quote}</blockquote>
          )}
        </div>
      </div>
    </div>
  );
}
