import { docTypeBadge } from '../lib/presentation'
import type { MasterRow } from '../lib/types'
import { ExternalLink } from './icons'

interface Props {
  row: MasterRow
}

export function TransactionSummary({ row }: Props) {
  const badge = docTypeBadge(row.documentType)
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: badge.bg, color: badge.fg }}>{badge.label}</span>
        {row.sheetUrl.href ? (
          <a href={row.sheetUrl.href} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            View sheet <ExternalLink size={11} />
          </a>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>{row.transactionId}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        <span>
          App&nbsp;ID&nbsp; <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{row.appId}</b>
        </span>
        <span>
          Request&nbsp;ID&nbsp; <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{row.requestId.slice(0, 8)}…</b>
        </span>
      </div>
    </div>
  )
}
