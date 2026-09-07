import { avatarColor, docTypeBadge, reviewerInitials, statusDotColor } from '../lib/presentation'
import type { MasterRow } from '../lib/types'

interface Props {
  rows: MasterRow[]
  selectedRequestId: string | null
  onSelect: (requestId: string) => void
}

export function QueueList({ rows, selectedRequestId, onSelect }: Props) {
  return (
    <div
      style={{
        width: 272,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          padding: '13px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Queue</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-tint)',
            padding: '2px 8px',
            borderRadius: 20,
          }}
        >
          {rows.length}
        </span>
      </div>

      <div className="rd-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No documents match these filters.
          </div>
        )}

        {rows.map((row) => {
          const selected = row.requestId === selectedRequestId
          const badge = docTypeBadge(row.documentType)
          const avatar = avatarColor(row.reviewer)
          return (
            <button
              key={row.requestId}
              onClick={() => onSelect(row.requestId)}
              style={{
                textAlign: 'left',
                padding: 10,
                borderRadius: 8,
                background: selected ? 'var(--accent-tint)' : 'transparent',
                border: selected ? '1px solid oklch(78% 0.09 255)' : '1px solid transparent',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    fontWeight: selected ? 600 : 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 170,
                  }}
                >
                  {row.transactionId}
                </span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusDotColor(row), flexShrink: 0 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 5,
                    background: badge.bg,
                    color: badge.fg,
                  }}
                >
                  {badge.label}
                </span>
                <div
                  title={row.reviewer}
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: '50%',
                    background: avatar.bg,
                    color: avatar.fg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8.5,
                    fontWeight: 600,
                  }}
                >
                  {reviewerInitials(row.reviewer)}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
