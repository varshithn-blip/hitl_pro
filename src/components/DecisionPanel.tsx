import { baseDocType } from '../lib/taxonomy'
import type { CategoryValue, DecisionDraft, Taxonomy } from '../lib/types'
import { ArrowRight, Check, Plus, X } from './icons'

interface Props {
  taxonomy: Taxonomy
  documentType: string
  draft: DecisionDraft
  onChange: (next: DecisionDraft) => void
  onSubmit: () => void
  submitting: boolean
}

const CATEGORY_OPTIONS: { value: CategoryValue; label: string; color: string; icon: React.ReactNode }[] = [
  { value: 'Valid', label: 'Approve', color: 'var(--success)', icon: <Check size={14} /> },
  { value: 'Invalid', label: 'Reject', color: 'var(--danger)', icon: <X size={14} /> },
  { value: 'Incomplete', label: 'Incomplete', color: 'var(--warning)', icon: <X size={14} /> },
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
  const needsReason = draft.category === 'Invalid' || draft.category === 'Incomplete'
  const canSubmit = draft.category !== '' && (!needsReason || draft.rejectionReason !== '') && !submitting

  const availableFraudReasons = taxonomy.fraudReasons.filter((r) => !draft.fraudReason.includes(r))

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border-strong)',
        background: 'var(--bg-subtle)',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Decision</span>

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
                  rejectionReason: opt.value === 'Valid' ? '' : draft.rejectionReason,
                })
              }
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fieldLabelStyle}>Fraud signals</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '6px 8px', background: 'white' }}>
          {draft.fraudReason.map((reason) => (
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
              <button
                onClick={() => onChange({ ...draft, fraudReason: draft.fraudReason.filter((r) => r !== reason) })}
                style={{ display: 'flex', background: 'none', border: 'none', color: 'inherit' }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {availableFraudReasons.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onChange({ ...draft, fraudReason: [...draft.fraudReason, e.target.value] })
              }}
              style={{ border: 'none', background: 'none', fontSize: 11.5, color: 'var(--accent)', fontWeight: 500 }}
            >
              <option value="">+ Add fraud signal…</option>
              {availableFraudReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

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
