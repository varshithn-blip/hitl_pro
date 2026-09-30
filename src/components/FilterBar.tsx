import { useEffect, useState } from 'react'
import { docTypeBadge } from '../lib/presentation'
import type { ApiCalledFilter, QueueFilters } from '../lib/types'
import { ChevronDown, Search } from './icons'

interface ChipSelectProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  width?: number
}

function ChipSelect({ label, value, options, onChange, width }: ChipSelectProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '7px 28px 7px 11px',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        background: 'var(--bg-panel)',
        fontSize: 12.5,
        width,
      }}
    >
      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {options.find((o) => o.value === value)?.label ?? value}
      </span>
      <ChevronDown size={13} style={{ color: 'var(--text-secondary)', position: 'absolute', right: 10 }} />
    </div>
  )
}

const API_CALLED_OPTIONS: { value: ApiCalledFilter; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'done', label: 'Done only' },
  { value: 'not_done', label: 'Not done' },
]

/** Unlike every other filter here, changing this one triggers a real
 * network re-fetch from a different starting row (see fetchMasterRows'
 * `startRow`) — not just a client-side re-filter of rows already in
 * memory. Firing that on every keystroke would mean typing "500" fetches
 * three times (for "5", "50", "500"), the opposite of what this filter
 * is for on a weak connection. So this keeps its own local draft and only
 * commits — calling onChange, which is what actually kicks off the
 * re-fetch — on blur or Enter, same as a normal "apply" field. */
function StartAfterRowInput({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  const [draft, setDraft] = useState(value != null ? String(value) : '')

  // Keep the draft in sync if the real value changes from elsewhere (e.g.
  // switching date tabs doesn't touch this filter, but a future "clear
  // all filters" action might).
  useEffect(() => {
    setDraft(value != null ? String(value) : '')
  }, [value])

  const commit = () => {
    const trimmed = draft.trim()
    const parsed = trimmed === '' ? null : Math.max(1, Math.floor(Number(trimmed)))
    const next = parsed != null && Number.isFinite(parsed) ? parsed : null
    setDraft(next != null ? String(next) : '')
    if (next !== value) onChange(next)
  }

  return (
    <div
      title="Skip rows up to and including this sheet row number — e.g. 500 to start reviewing at row 501. Those earlier rows are never fetched, not just hidden."
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        background: 'var(--bg-panel)',
        width: 168,
      }}
    >
      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Start after row</span>
      <input
        type="number"
        min={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur() // triggers onBlur -> commit
          if (e.key === 'Escape') setDraft(value != null ? String(value) : '')
        }}
        placeholder="e.g. 500"
        style={{ border: 'none', outline: 'none', background: 'none', fontSize: 12.5, width: '100%', minWidth: 0 }}
      />
    </div>
  )
}

interface Props {
  dateTabs: string[]
  reviewers: string[]
  docTypes: string[]
  filters: QueueFilters
  onChange: (next: QueueFilters) => void
  queueCount: number
  pendingCount: number
  search: string
  onSearchChange: (value: string) => void
}

export function FilterBar({ dateTabs, reviewers, docTypes, filters, onChange, queueCount, pendingCount, search, onSearchChange }: Props) {
  return (
    <div
      style={{
        height: 54,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 24px',
        background: 'var(--bg-subtle)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <ChipSelect
        label="Date"
        value={filters.date}
        onChange={(date) => onChange({ ...filters, date })}
        options={dateTabs.map((d) => ({ value: d, label: d }))}
        width={170}
      />

      <ChipSelect
        label="Reviewer"
        value={filters.reviewer}
        onChange={(reviewer) => onChange({ ...filters, reviewer: reviewer as QueueFilters['reviewer'] })}
        options={[{ value: 'All', label: 'All reviewers' }, ...reviewers.map((r) => ({ value: r, label: r }))]}
        width={190}
      />

      <ChipSelect
        label="Doc type"
        value={filters.documentType}
        onChange={(documentType) => onChange({ ...filters, documentType })}
        options={[{ value: 'All', label: 'All types' }, ...docTypes.map((t) => ({ value: t, label: docTypeBadge(t).label }))]}
        width={170}
      />

      <ChipSelect
        label="Status"
        value={filters.status}
        onChange={(status) => onChange({ ...filters, status: status as QueueFilters['status'] })}
        options={[
          { value: 'All', label: 'All' },
          { value: 'Pending', label: 'Pending review' },
          { value: 'Manually Approved', label: 'Manually Approved' },
          { value: 'Manually Rejected', label: 'Manually Rejected' },
        ]}
        width={190}
      />

      <ChipSelect
        label="API called"
        value={filters.apiCalled}
        onChange={(apiCalled) => onChange({ ...filters, apiCalled: apiCalled as ApiCalledFilter })}
        options={API_CALLED_OPTIONS}
        width={170}
      />

      <StartAfterRowInput value={filters.startAfterRow} onChange={(startAfterRow) => onChange({ ...filters, startAfterRow })} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          background: 'var(--bg-panel)',
          width: 220,
        }}
      >
        <Search size={14} style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search transaction ID"
          style={{ border: 'none', outline: 'none', background: 'none', fontSize: 12.5, width: '100%' }}
        />
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <b style={{ color: 'var(--text-primary)' }}>{queueCount}</b> in queue &nbsp;·&nbsp; <b style={{ color: 'var(--warning)' }}>{pendingCount}</b> pending
      </div>
    </div>
  )
}
