import { useState } from 'react'
import { avatarColor, docTypeBadge, reviewerInitials, statusDotColor } from '../lib/presentation'
import { isPendingStatus, masterRowKey, type MasterRow } from '../lib/types'
import { ChevronLeft, ChevronRight } from './icons'

interface Props {
  rows: MasterRow[]
  /** masterRowKey (Transaction ID + Document Type) of the selected row,
   * not Request ID — see MasterRow.requestId's comment in types.ts. */
  selectedRowKey: string | null
  onSelect: (rowKey: string) => void
}

const EXPANDED_WIDTH = 272
const COLLAPSED_WIDTH = 44

export function QueueList({ rows, selectedRowKey, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const pendingCount = rows.filter((r) => isPendingStatus(r.status)).length

  if (collapsed) {
    return (
      <div
        style={{
          width: COLLAPSED_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: '13px 0',
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
        }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Expand queue"
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            border: 'none',
            background: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
          }}
        >
          <ChevronRight size={14} />
        </button>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: pendingCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
            background: pendingCount > 0 ? 'var(--accent-tint)' : 'oklch(93% 0.006 255)',
            padding: '2px 7px',
            borderRadius: 20,
          }}
        >
          {rows.length}
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.06em',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}
        >
          QUEUE
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        width: EXPANDED_WIDTH,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse queue — more room for the document viewer"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 'none',
            background: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      <div className="rd-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No documents match these filters.
          </div>
        )}

        {rows.map((row) => {
          const rowKey = masterRowKey(row)
          const selected = rowKey === selectedRowKey
          const isDone = !isPendingStatus(row.status)
          const badge = docTypeBadge(row.documentType)
          const avatar = avatarColor(row.reviewer)
          const statusLabel = row.status === 'Manually Approved' ? 'Approved' : row.status === 'Manually Rejected' ? 'Rejected' : 'Pending'
          return (
            <button
              key={rowKey}
              onClick={() => onSelect(rowKey)}
              style={{
                textAlign: 'left',
                padding: 10,
                borderRadius: 8,
                background: selected ? 'var(--accent-tint)' : 'transparent',
                border: selected ? '1px solid oklch(78% 0.09 255)' : '1px solid transparent',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                // Pending rows recede so completed ones (full color, a
                // clear Approved/Rejected label below) stand out at a
                // glance — the ask was "not clear what's done vs not".
                opacity: isDone || selected ? 1 : 0.55,
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
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    color: isDone ? statusDotColor(row) : 'var(--text-muted)',
                  }}
                >
                  {statusLabel}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 5,
                      background: isDone ? badge.bg : 'oklch(93% 0.006 255)',
                      color: isDone ? badge.fg : 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {badge.label}
                  </span>
                  {/* The exact tab name (payslip_0 vs payslip_1, ...), not
                      just the friendly badge above. This is more than a
                      nice-to-have: Transaction ID + this exact tab name is
                      this app's actual unique key for a row (see
                      masterRowKey in types.ts) — Request ID was found to
                      repeat across rows in real data, so it can't be
                      trusted for that. Two cards sharing both a
                      Transaction ID and this exact tab name are a genuine
                      upstream duplicate (the one case even this can't
                      disambiguate), not an app bug. */}
                  <span
                    title={`${row.documentType} — Request ID: ${row.requestId} (real data has shown this repeating across rows, so it's not what identifies this card)`}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.documentType}
                  </span>
                </div>
                <div
                  title={row.reviewer}
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: '50%',
                    background: isDone ? avatar.bg : 'oklch(90% 0.006 255)',
                    color: isDone ? avatar.fg : 'var(--text-secondary)',
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
