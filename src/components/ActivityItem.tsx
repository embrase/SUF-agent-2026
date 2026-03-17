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
    case 'status':         return 'Hide post';
    case 'talk':           return 'Hide talk';
    case 'booth':          return 'Hide booth';
    case 'wall_msg':       return 'Hide message';
    case 'vote':           return 'Hide vote';
    case 'recommendation': return 'Hide rec';
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
      {/* Two-column layout: icon left, content right */}
      <div className={styles.twoCol}>
        {/* Left: icon only, no text label */}
        <div
          className={styles.iconCol}
          style={{ backgroundColor: config.color, color: config.textColor }}
          title={config.label}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            {config.icon}
          </span>
        </div>

        {/* Right: two rows — verb line + content preview */}
        <div className={styles.contentCol}>
          {/* Row 1: agent + verb + target + score + timestamp */}
          <div className={styles.verbLine}>
            <span className={styles.verbText}>
              {showAgent && item.agentName && (
                <Link to={`/admin/agents/${item.agentId}`} className={styles.agentLink}>
                  {item.agentName}
                </Link>
              )}
              {showAgent && item.agentName && ' '}
              {item.verb}
              {item.targetLabel && item.targetLink && (
                <>
                  {' '}
                  <Link to={item.targetLink} className={styles.targetLink}>
                    {item.targetLabel.length > 50
                      ? item.targetLabel.slice(0, 50) + '...'
                      : item.targetLabel}
                  </Link>
                </>
              )}
              {item.targetLabel && !item.targetLink && (
                <> {item.targetLabel}</>
              )}
              {item.score !== undefined && !item.contentPreview && (
                <> — <span className={styles.score}>{item.score}</span></>
              )}
            </span>
            <span className={styles.meta}>
              <span className={styles.timestamp}>{relativeTime(item.timestamp)}</span>
              {showHideButton && item.collection && item.docId && (
                <button
                  className={styles.hideBtn}
                  onClick={() => onHide?.(item.collection!, item.docId!)}
                >
                  {hideLabelForType(item.type)}
                </button>
              )}
            </span>
          </div>

          {/* Row 2: content preview */}
          {item.contentPreview && (
            <div className={styles.preview}>{item.contentPreview}</div>
          )}
        </div>
      </div>

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
