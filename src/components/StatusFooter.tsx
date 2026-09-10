interface Props {
  queueCount: number
  pendingCount: number
  syncState: 'idle' | 'saving' | 'saved' | 'error'
  syncMessage?: string
  /** Set while a large date tab is still streaming in past its first
   * batch (see usePortal.ts `fetchMasterRows`) — surfaces "loading, not
   * stuck" for a queue that can run into the thousands of rows. */
  loadingProgress?: { loaded: number; total: number } | null
}

const SYNC_LABEL: Record<Props['syncState'], string> = {
  idle: 'All changes saved',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed — see console',
}

const SYNC_COLOR: Record<Props['syncState'], string> = {
  idle: 'var(--success)',
  saving: 'var(--warning)',
  saved: 'var(--success)',
  error: 'var(--danger)',
}

export function StatusFooter({ queueCount, pendingCount, syncState, syncMessage, loadingProgress }: Props) {
  return (
    <div
      style={{
        height: 26,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        fontSize: 10.5,
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: SYNC_COLOR[syncState], display: 'inline-block' }} />
        {syncMessage ?? SYNC_LABEL[syncState]}
      </div>
      <div>
        {loadingProgress ? (
          <span style={{ color: 'var(--warning)' }}>
            Loading documents… {loadingProgress.loaded} / {loadingProgress.total}
          </span>
        ) : (
          <>
            {queueCount} documents · {pendingCount} pending review
          </>
        )}
      </div>
    </div>
  )
}
