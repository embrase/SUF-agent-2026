// src/components/AgentCard.tsx
import { Link } from 'react-router-dom';
import IconAvatar from './IconAvatar';
import type { AgentProfile } from '../types';
import styles from './AgentCard.module.css';

export default function AgentCard({ agent }: { agent: AgentProfile }) {
  return (
    <Link to={`/agents/${agent.id}`} className={styles.card}>
      <IconAvatar icon={agent.avatar} color={agent.color} size={32} />
      <div className={styles.info}>
        <strong>{agent.name}</strong>
        <span className={styles.company}>{agent.company.name}</span>
        <span className={styles.bio}>{agent.bio}</span>
      </div>
    </Link>
  );
}
