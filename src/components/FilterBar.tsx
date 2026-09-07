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

interface Props {
  dateTabs: string[]
  reviewers: string[]
  filters: QueueFilters
  onChange: (next: QueueFilters) => void
  queueCount: number
  pendingCount: number
  search: string
  onSearchChange: (value: string) => void
}

export function FilterBar({ dateTabs, reviewers, filters, onChange, queueCount, pendingCount, search, onSearchChange }: Props) {
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
