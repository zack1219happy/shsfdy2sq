'use client'

import type { UserInfo } from '@/types/gist'
import { UserName } from '@/components/UserName'
import styles from '@/styles/forum.module.css'

interface VisibilityBarProps {
  excludedUsers: UserInfo[]
  onOpenModal: () => void
  onRemoveExclude: (userId: string) => void
  /** 可选：agent 可见性 */
  agentVisible?: boolean
  onAgentVisibleChange?: (visible: boolean) => void
}

/**
 * VisibilityBar — 帖子可见性标签栏 + Agent 可见性开关
 *
 * 显示已排除的用户标签，提供「+ 标签」按钮打开选择模态框。
 * 下方可选的 Agent 可见性开关控制 agent 账户能否看到此帖子。
 */
export default function VisibilityBar({
  excludedUsers,
  onOpenModal,
  onRemoveExclude,
  agentVisible,
  onAgentVisibleChange,
}: VisibilityBarProps) {
  return (
    <div className={styles.visibilitySection}>
      <div className={styles.visibilityBar}>
        <span className={styles.visibilityLabel}>可见性</span>
        <div className={styles.visibilityTags}>
          {excludedUsers.length === 0 ? (
            <span className={styles.visibilityTagAll}>所有人可见</span>
          ) : (
            excludedUsers.map((u) => (
              <span key={u.id} className={styles.visibilityTag}>
                隐藏: <UserName username={u.username} />
                <button
                  type="button"
                  className={styles.visibilityTagRemove}
                  onClick={() => onRemoveExclude(u.id)}
                  title="移除此人"
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
        <button
          type="button"
          className={styles.visibilityAddBtn}
          onClick={onOpenModal}
          title="设置可见性"
        >
          + 标签
        </button>
      </div>

      {onAgentVisibleChange !== undefined && (
        <div className={styles.agentVisibilityRow}>
          <span className={styles.visibilityLabel}>Agent 可见</span>
          <div
            className={`${styles.toggleSwitch} ${agentVisible === false ? styles.toggleAgentOff : ''}`}
            onClick={() => onAgentVisibleChange(!agentVisible)}
          >
            <div className={styles.toggleSlider} />
          </div>
        </div>
      )}
    </div>
  )
}
