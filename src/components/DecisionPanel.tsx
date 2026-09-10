import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { baseDocType } from '../lib/taxonomy'
import type { CategoryValue, DecisionDraft, StatusValue, Taxonomy, TaxonomyFieldSource } from '../lib/types'
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

/** Makes it visible, not just claimed, whether an options list actually
 * came from the master sheet's own data-validation rule or from the
 * hardcoded fallback in lib/taxonomy.ts — so "is this really reading the
 * sheet's dropdown?" is answered by looking at the screen, not by asking. */
function SourceBadge({ source, count }: { source: TaxonomyFieldSource; count: number }) {
  const fromSheet = source === 'sheet'
  return (
    <span
      title={
        fromSheet
          ? `Read live from the master sheet's dropdown (${count} option${count === 1 ? '' : 's'}).`
          : "Could not read this dropdown's rule from the sheet — showing the app's built-in fallback list instead, which may be out of date."
      }
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: 20,
        color: fromSheet ? 'var(--success)' : 'var(--warning)',
        background: fromSheet ? 'var(--success-tint)' : 'var(--warning-tint)',
        cursor: 'help',
      }}
    >
      {fromSheet ? 'From sheet' : 'Fallback list'}
    </span>
  )
}

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
  // An Incomplete document is by definition missing something required -
  // it can't be Approved. Rejecting it (or leaving the decision open) are
  // the only valid outcomes.
  const isIncomplete = draft.category === 'Incomplete'
  const canSubmit = draft.category !== '' && draft.status !== '' && !(isIncomplete && draft.status === 'Manually Approved') && (!needsReason || draft.rejectionReason !== '') && !submitting

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
                onClick={() =>
                  onChange({
                    ...draft,
                    category: opt.value,
                    // Incomplete can't be Approved — switching to it while
                    // Approve was already picked resets the decision so
                    // the reviewer has to make a valid choice again.
                    status: opt.value === 'Incomplete' && draft.status === 'Manually Approved' ? '' : draft.status,
                  })
                }
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
            const disabled = isIncomplete && opt.value === 'Manually Approved'
            return (
              <button
                key={opt.value}
                disabled={disabled}
                title={disabled ? 'An Incomplete document cannot be approved' : undefined}
                onClick={() => onChange({ ...draft, status: opt.value, rejectionReason: opt.value === 'Manually Approved' ? '' : draft.rejectionReason })}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 8,
                  border: active ? 'none' : '1px solid var(--border-strong)',
                  background: disabled ? 'oklch(93% 0.006 255)' : active ? opt.color : 'white',
                  color: disabled ? 'var(--text-muted)' : active ? 'white' : opt.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {opt.icon}
                {opt.label}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {isIncomplete ? "An Incomplete document can't be approved." : 'Independent of category above — a Valid document can still be rejected for other reasons.'}
        </span>
      </div>

      {needsReason && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={fieldLabelStyle}>Rejection reason</span>
            <SourceBadge source={taxonomy.source.rejectionReason} count={reasons.length} />
          </div>
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

      <FraudReasonPicker
        options={taxonomy.fraudReasons}
        selected={draft.fraudReason}
        onChange={(fraudReason) => onChange({ ...draft, fraudReason })}
        source={taxonomy.source.fraudReasons}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={fieldLabelStyle}>Reclassify document type</span>
          <SourceBadge source={taxonomy.source.reclassifyOptions} count={taxonomy.reclassifyOptions.length} />
        </div>
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

const POPOVER_GAP = 4
const POPOVER_MAX_HEIGHT = 260
const POPOVER_MIN_SPACE = 160 // below this much room, prefer flipping upward instead

interface PopoverPosition {
  left: number
  width: number
  maxHeight: number
  // Fixed-position coordinates: exactly one of top/bottom is set,
  // matching whichever direction fits.
  top?: number
  bottom?: number
}

function FraudReasonPicker({
  options,
  selected,
  onChange,
  source,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  source: TaxonomyFieldSource
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Rendered via a portal at document.body (position: fixed, computed from
  // the trigger's real screen position) rather than absolutely inside this
  // panel, which scrolls its own content — an absolutely-positioned
  // popover would get clipped by that scroll container the moment the
  // trigger isn't near the very top or bottom of the visible area. This
  // also lets it open downward like every other dropdown in this panel by
  // default, flipping up only when there's genuinely no room below.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUpward = spaceBelow < POPOVER_MIN_SPACE && spaceAbove > spaceBelow

    setPosition({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(POPOVER_MAX_HEIGHT, (openUpward ? spaceAbove : spaceBelow) - POPOVER_GAP - 8),
      ...(openUpward ? { bottom: window.innerHeight - rect.top + POPOVER_GAP } : { top: rect.bottom + POPOVER_GAP }),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', updatePosition)
    // capture:true so this also fires for scrolling inside the (scrollable)
    // decision panel itself, not just window-level scrolling.
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  const toggle = (reason: string) => {
    onChange(selected.includes(reason) ? selected.filter((r) => r !== reason) : [...selected, reason])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} ref={containerRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={fieldLabelStyle}>Fraud signals</span>
        <SourceBadge source={source} count={options.length} />
      </div>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          minHeight: 34,
          border: '1px solid var(--border-strong)',
          borderRadius: 7,
          padding: '7px 10px',
          background: 'white',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {selected.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No fraud signals selected</span>}
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

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              left: position.left,
              width: position.width,
              top: position.top,
              bottom: position.bottom,
              maxHeight: position.maxHeight,
              display: 'flex',
              flexDirection: 'column',
              background: 'white',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              boxShadow: '0 12px 28px -8px oklch(20% 0.02 255 / 0.25)',
              zIndex: 1000,
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
          </div>,
          document.body,
        )}
    </div>
  )
}
