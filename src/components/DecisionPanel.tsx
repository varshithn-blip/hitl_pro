import { useEffect, useRef, useState } from 'react'
import { baseDocType } from '../lib/taxonomy'
import type { CategoryValue, DecisionDraft, StatusValue, Taxonomy } from '../lib/types'
import { ArrowRight, Check, ChevronDown, X } from './icons'

interface Props {
  taxonomy: Taxonomy
  documentType: string
  draft: DecisionDraft
  onChange: (next: DecisionDraft) => void
  onSubmit: () => void
  submitting: boolean
}

const CATEGORY_OPTIONS: { value: CategoryValue; label: string; color: string }[] = [
  { value: 'Valid', label: 'Valid', color: 'var(--success)' },
  { value: 'Invalid', label: 'Invalid', color: 'var(--danger)' },
  { value: 'Incomplete', label: 'Incomplete', color: 'var(--warning)' },
]

const STATUS_OPTIONS: { value: StatusValue; label: string; color: string; icon: React.ReactNode }[] = [
  { value: 'Manually Approved', label: 'Approve', color: 'var(--success)', icon: <Check size={14} /> },
  { value: 'Manually Rejected', label: 'Reject', color: 'var(--danger)', icon: <X size={14} /> },
]

const fieldLabelStyle: React.CSSProperties = { fontSize: 10.5, color: 'var(--text-secondary)' }
const selectBoxStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border-strong)',
  borderRadius: 7,
  padding: '8px 10px',
  fontSize: 12.5,
  background: 'white',
}

export function DecisionPanel({ taxonomy, documentType, draft, onChange, onSubmit, submitting }: Props) {
  const docType = baseDocType(documentType)
  const reasons = taxonomy.rejectionReasonsByDocType[docType] ?? []
  const needsReason = draft.status === 'Manually Rejected'
  const canSubmit = draft.category !== '' && draft.status !== '' && (!needsReason || draft.rejectionReason !== '') && !submitting

  return (
    <div
      className="rd-scroll"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        background: 'var(--bg-subtle)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={fieldLabelStyle}>Document category</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {CATEGORY_OPTIONS.map((opt) => {
            const active = draft.category === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ ...draft, category: opt.value })}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 8,
                  border: active ? 'none' : '1px solid var(--border-strong)',
                  background: active ? opt.color : 'white',
                  color: active ? 'white' : opt.color,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={fieldLabelStyle}>Decision</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUS_OPTIONS.map((opt) => {
            const active = draft.status === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ ...draft, status: opt.value, rejectionReason: opt.value === 'Manually Approved' ? '' : draft.rejectionReason })}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 8,
                  border: active ? 'none' : '1px solid var(--border-strong)',
                  background: active ? opt.color : 'white',
                  color: active ? 'white' : opt.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {opt.icon}
                {opt.label}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Independent of category above — a Valid document can still be rejected for other reasons.</span>
      </div>

      {needsReason && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={fieldLabelStyle}>Rejection reason</span>
          <select value={draft.rejectionReason} onChange={(e) => onChange({ ...draft, rejectionReason: e.target.value })} style={selectBoxStyle}>
            <option value="">Select a reason…</option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      )}

      <FraudReasonPicker options={taxonomy.fraudReasons} selected={draft.fraudReason} onChange={(fraudReason) => onChange({ ...draft, fraudReason })} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fieldLabelStyle}>Reclassify document type</span>
        <select value={draft.reclassified} onChange={(e) => onChange({ ...draft, reclassified: e.target.value })} style={selectBoxStyle}>
          <option value="">Keep as {docType}</option>
          {taxonomy.reclassifyOptions
            .filter((o) => o !== docType)
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Change this if the document was tagged incorrectly.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fieldLabelStyle}>Notes for other reviewers</span>
        <textarea
          value={draft.flags}
          onChange={(e) => onChange({ ...draft, flags: e.target.value })}
          placeholder="Add context for the next reviewer or QA…"
          style={{ ...selectBoxStyle, height: 48, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: 42,
          borderRadius: 8,
          border: 'none',
          background: canSubmit ? 'var(--accent)' : 'oklch(88% 0.006 255)',
          color: canSubmit ? 'white' : 'var(--text-muted)',
          fontSize: 13.5,
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {submitting ? 'Saving…' : 'Submit & Next'}
        {!submitting && <ArrowRight size={15} />}
      </button>
      <span style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>Saves to the master sheet + OCR sheet instantly</span>
    </div>
  )
}

function FraudReasonPicker({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = (reason: string) => {
    onChange(selected.includes(reason) ? selected.filter((r) => r !== reason) : [...selected, reason])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }} ref={containerRef}>
      <span style={fieldLabelStyle}>Fraud signals</span>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          minHeight: 34,
          border: '1px solid var(--border-strong)',
          borderRadius: 7,
          padding: '6px 8px',
          background: 'white',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {selected.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No fraud signals selected</span>}
          {selected.map((reason) => (
            <span
              key={reason}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11.5,
                fontWeight: 500,
                background: 'var(--warning-tint)',
                color: 'var(--warning)',
                padding: '4px 8px',
                borderRadius: 20,
              }}
            >
              {reason}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(reason)
                }}
                style={{ display: 'flex', color: 'inherit' }}
              >
                <X size={11} />
              </span>
            </span>
          ))}
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 260,
            display: 'flex',
            flexDirection: 'column',
            background: 'white',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            boxShadow: '0 12px 28px -8px oklch(20% 0.02 255 / 0.25)',
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          <div className="rd-scroll" style={{ overflowY: 'auto', padding: 6 }}>
            {options.map((reason) => {
              const checked = selected.includes(reason)
              return (
                <label
                  key={reason}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 8px',
                    borderRadius: 6,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    background: checked ? 'var(--accent-tint)' : 'transparent',
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(reason)} style={{ margin: 0 }} />
                  {reason}
                </label>
              )
            })}
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              flexShrink: 0,
              height: 36,
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              color: 'var(--accent)',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
