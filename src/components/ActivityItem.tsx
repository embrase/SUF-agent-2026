// src/components/ActivityItem.tsx
import { Link } from 'react-router-dom';
import type { ActivityItem as ActivityItemType } from '../lib/activity';
import { relativeTime } from '../lib/activity';
import { ACTIVITY_ICONS } from '../lib/icons';
import styles from './ActivityItem.module.css';

interface Props {
  item: ActivityItemType;
  showAgent?: boolean;
  showHideButton?: boolean;
  onHide?: (collection: string, docId: string) => void;
}

function hideLabelForType(type: ActivityItemType['type']): string {
  switch (type) {
    case 'status':         return 'Hide message';
    case 'talk':           return 'Hide talk';
    case 'booth':          return 'Hide booth';
    case 'wall_msg':       return 'Hide message';
    case 'vote':           return 'Hide post';
    case 'recommendation': return 'Hide post';
    case 'manifesto':      return 'Hide post';
    case 'yearbook':       return 'Hide post';
    case 'registered':     return 'Hide post';
    default:               return 'Hide';
  }
}

export function ActivityItemRow({
  item,
  showAgent = true,
  showHideButton = false,
  onHide,
}: Props) {
  const config = ACTIVITY_ICONS[item.type];

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        {/* Left: badge + agent + verb + target + score */}
        <div className={styles.left}>
          {/* Type badge */}
          <span
            className={styles.badge}
            style={{ backgroundColor: config.color, color: config.textColor }}
          >
            <span className={`material-symbols-outlined ${styles.badgeIcon}`}>
              {config.icon}
            </span>
            {config.label}
          </span>

          {/* Agent name */}
          {showAgent && item.agentName && (
            <Link to={`/admin/agents/${item.agentId}`} className={styles.agentLink}>
              {item.agentName}
            </Link>
          )}

          {/* Verb */}
          {item.verb && <span className={styles.verb}>{item.verb}</span>}

          {/* Target */}
          {item.targetLink && item.targetLabel && (
            <Link to={item.targetLink} className={styles.targetLink}>
              {item.targetLabel}
            </Link>
          )}
          {!item.targetLink && item.targetLabel && (
            <span>{item.targetLabel}</span>
          )}

          {/* Score (for votes / recommendations) */}
          {item.score !== undefined && (
            <span className={styles.score}>{item.score}</span>
          )}
        </div>

        {/* Right: timestamp + hide button */}
        <div className={styles.meta}>
          <span className={styles.timestamp}>{relativeTime(item.timestamp)}</span>

          {showHideButton && item.collection && item.docId && (
            <button
              className={styles.hideBtn}
              onClick={() => onHide?.(item.collection!, item.docId!)}
            >
              {hideLabelForType(item.type)}
            </button>
          )}
        </div>
      </div>

      {/* Content preview */}
      {item.contentPreview && (
        <div className={styles.preview}>{item.contentPreview}</div>
      )}

      {/* Thread reply indicator */}
      {item.threadReply && (
        <div className={styles.threadReply}>
          <div className={styles.threadReplyHeader}>
            {item.threadReply.agentName && (
              <Link
                to={`/admin/agents/${item.threadReply.agentId}`}
                className={styles.agentLink}
              >
                {item.threadReply.agentName}
              </Link>
            )}
            <span className={styles.timestamp}>
              {relativeTime(item.threadReply.timestamp)}
            </span>
          </div>
          {item.threadReply.contentPreview && (
            <div className={styles.threadReplyContent}>
              {item.threadReply.contentPreview}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
