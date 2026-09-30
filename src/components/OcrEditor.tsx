import { useRef } from 'react'
import { evaluateExpression, formatComputed } from '../lib/calculator'
import { PAYSLIP_AUTO_FIELD_LABELS, type PayslipCalculatorInputs } from '../lib/payslipCalc'
import type { OutdatedCheckResult } from '../lib/ruleChecks'
import { baseDocType } from '../lib/taxonomy'
import type { OcrSection } from '../lib/types'
import { AlertTriangle, Check, Plus, X } from './icons'

interface Props {
  sections: OcrSection[]
  onFieldChange: (sectionIndex: number, fieldIndex: number, value: string) => void
  onTableCellChange: (sectionIndex: number, rowIndex: number, colIndex: number, value: string) => void
  onAddTableRow: (sectionIndex: number) => void
  onRemoveTableRow: (sectionIndex: number, rowIndex: number) => void
  /** Result of the last time the reviewer clicked the "Submit OCR
   * corrections" button below, or null if they haven't yet (or have
   * edited something since — see usePortal.ts's edit handlers). Passed
   * through to `FieldsSection` so the one field a check actually looked
   * at (e.g. Salary Period End Date) can show its warning right next to
   * itself, not as a generic banner disconnected from the field it's
   * about. */
  checkResult: OutdatedCheckResult | null
  /** Runs the check and returns its result synchronously — see this
   * component's own submit handler below, which uses the return value
   * (not a separate effect on `checkResult`) to decide whether to scroll
   * to the flagged field or hand off to `onNavigateToDecision`. */
  onConfirmOcr: () => OutdatedCheckResult | null
  /** Switches the right-hand panel to the Decision tab — lives in
   * App.tsx (that's where `rightTab` state is), passed down so a clean
   * "Submit OCR corrections" click can move the reviewer forward on its
   * own instead of leaving them to find the Decision tab themselves. */
  onNavigateToDecision: () => void
  /** The exact tab name ("payslip_0", ...) — used only to decide
   * whether to show the Payslip-only Salary Calculator block below;
   * everything else in this file works off the parsed `sections`
   * regardless of document type. */
  documentType: string
  payslipCalculator: PayslipCalculatorInputs
  onPayslipCalculatorChange: (field: keyof PayslipCalculatorInputs, value: string) => void
}

const fieldBoxStyle: React.CSSProperties = {
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  fontSize: 12.5,
  background: 'white',
  width: '100%',
}

export function OcrEditor({
  sections,
  onFieldChange,
  onTableCellChange,
  onAddTableRow,
  onRemoveTableRow,
  checkResult,
  onConfirmOcr,
  onNavigateToDecision,
  documentType,
  payslipCalculator,
  onPayslipCalculatorChange,
}: Props) {
  const isPayslip = baseDocType(documentType) === 'payslip'

  // One entry per field label, registered by every FieldsSection field row
  // regardless of whether it's currently flagged — so the target element
  // is always there to scroll to the instant a check flags it, with no
  // wait for a re-render to create it.
  const fieldRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const registerFieldRef = (label: string, el: HTMLDivElement | null) => {
    if (el) fieldRefs.current.set(label, el)
    else fieldRefs.current.delete(label)
  }

  // The whole point of this button, per explicit direction: make its
  // effect unmistakable. A flagged field (outdated, or a date this
  // couldn't even parse) scrolls it into view right here on the OCR tab
  // so the reviewer sees exactly what to look at, and can then either
  // fix it and re-submit or decide the flag is correct and move on
  // themselves. Anything else — a clean check, or a document type this
  // rule doesn't apply to — has nothing left for the reviewer to look at
  // on this tab, so it advances them straight to Decision.
  const handleConfirmOcr = () => {
    const result = onConfirmOcr()
    if (!result) return
    if (result.status === 'outdated' || result.status === 'unparseable') {
      fieldRefs.current.get(result.fieldLabel)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      onNavigateToDecision()
    }
  }

  return (
    <div className="rd-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.map((section, sIdx) =>
        section.kind === 'fields' ? (
          <FieldsSection key={sIdx} section={section} onFieldChange={(fIdx, v) => onFieldChange(sIdx, fIdx, v)} checkResult={checkResult} registerFieldRef={registerFieldRef} />
        ) : (
          <TableSection
            key={sIdx}
            section={section}
            onCellChange={(rIdx, cIdx, v) => onTableCellChange(sIdx, rIdx, cIdx, v)}
            onAddRow={() => onAddTableRow(sIdx)}
            onRemoveRow={(rIdx) => onRemoveTableRow(sIdx, rIdx)}
          />
        ),
      )}

      {isPayslip && <PayslipCalculatorSection calculator={payslipCalculator} onChange={onPayslipCalculatorChange} />}

      {/* Deliberately separate from the Decision panel's own "Submit &
          Next" — this never saves anything to Sheets, it only runs the
          automatic rule checks (e.g. outdated-document) against whatever
          the reviewer has corrected the fields to. Placed at the very
          end of the OCR fields, per explicit direction, specifically so
          this only ever checks the reviewer's OWN corrected values, not
          a possibly-misread raw OCR date — it's a deliberate manual step,
          not something that runs automatically on load or on every
          keystroke. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <button
          onClick={handleConfirmOcr}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            height: 38,
            borderRadius: 8,
            border: '1px solid var(--border-strong)',
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            fontSize: 12.5,
            fontWeight: 600,
            marginTop: 8,
          }}
        >
          <Check size={14} />
          Submit OCR corrections
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
          Runs automatic checks (e.g. outdated document) against your corrected values — doesn't save anything by itself.
        </span>
        <CheckResultStatus result={checkResult} />
      </div>
    </div>
  )
}

/** The button's own feedback line — covers every outcome, not just the
 * "flagged" one (which also gets a more prominent warning right next to
 * the specific field, see FieldsSection below): a document type with no
 * rule, a field this couldn't find/parse, or a genuine clean check all
 * get an explicit, distinct response, so clicking this never feels like
 * it did nothing. */
function CheckResultStatus({ result }: { result: OutdatedCheckResult | null }) {
  if (!result) return null
  if (result.status === 'not-applicable') {
    return <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center' }}>No automatic checks apply to this document type.</span>
  }
  if (result.status === 'unparseable') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--warning)' }}>
        <AlertTriangle size={11} />
        Couldn't verify "{result.fieldLabel}" as a date — scrolled up to it above.
      </span>
    )
  }
  if (result.status === 'ok') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, color: 'var(--success)' }}>
        <Check size={11} />
        "{result.fieldLabel}" looks fine ({result.daysOld} day{result.daysOld === 1 ? '' : 's'} old) — moving to Decision.
      </span>
    )
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--danger)' }}>
      <AlertTriangle size={11} />
      Flagged — scrolled up to the field above.
    </span>
  )
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 7,
        marginBottom: 10,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</span>
      {action}
    </div>
  )
}

function FieldsSection({
  section,
  onFieldChange,
  checkResult,
  registerFieldRef,
}: {
  section: Extract<OcrSection, { kind: 'fields' }>
  onFieldChange: (fieldIndex: number, value: string) => void
  checkResult: OutdatedCheckResult | null
  /** Registers this field row's wrapper div so OcrEditor's submit handler
   * can scroll straight to it the instant a check flags it — see
   * OcrEditor's `fieldRefs`. Called for every field, flagged or not, so
   * the target always exists before it's ever needed. */
  registerFieldRef: (label: string, el: HTMLDivElement | null) => void
}) {
  return (
    <div>
      <SectionTitle>{section.title || 'Fields'}</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {section.fields.map((field, fIdx) => {
          const hasSuggestions = !!field.validationOptions?.length
          const datalistId = hasSuggestions ? `ocr-field-options-${field.rowIndex}` : undefined
          // Only ever set when the LAST "Submit OCR corrections" click
          // actually flagged THIS field — see usePortal.ts's
          // confirmOcrFields. Never shown for a field the check merely
          // looked at and found fine (that's the neutral/ok line at the
          // bottom of the whole panel instead, not a per-field banner).
          const outdated = checkResult?.status === 'outdated' && checkResult.fieldLabel === field.label ? checkResult : null
          const unparseable = checkResult?.status === 'unparseable' && checkResult.fieldLabel === field.label ? checkResult : null
          const flagged = outdated ?? unparseable
          const isAutoCalculated = PAYSLIP_AUTO_FIELD_LABELS.includes(field.label)
          return (
            <div key={fIdx} ref={(el) => registerFieldRef(field.label, el)} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, width: 124, flexShrink: 0 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{field.label}</span>
                  {field.remark && field.remark.toLowerCase() !== 'ok' && !field.remark.toLowerCase().endsWith(' ok') && (
                    <span title={field.remark} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 600, color: 'var(--warning)' }}>
                      <AlertTriangle size={11} />
                    </span>
                  )}
                  {hasSuggestions && (
                    <span
                      title={`${field.validationOptions!.length} suggestion${field.validationOptions!.length === 1 ? '' : 's'} read live from this cell's dropdown in the sheet — still a free-text field, so a value that doesn't match any of them stays as-is.`}
                      style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent)', cursor: 'help' }}
                    >
                      ▾ SHEET
                    </span>
                  )}
                  {isAutoCalculated && (
                    <span
                      title="Kept in sync automatically — Duration from Salary Period Start/End Date above, Gross/Net/SSS/PhilHealth from the Salary Calculator below. Still a normal editable field: typing over it sticks until its own source changes again."
                      style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--success)', cursor: 'help' }}
                    >
                      ⟳ AUTO
                    </span>
                  )}
                </div>
                {/* Suggestions, not a locked choice — a plain text input with
                    an optional <datalist>, so an OCR value that doesn't match
                    any live option is never blocked or silently reset (see
                    OcrField.validationOptions and attachFieldValidation). */}
                <input
                  list={datalistId}
                  value={field.value}
                  onChange={(e) => onFieldChange(fIdx, e.target.value)}
                  style={{ ...fieldBoxStyle, padding: '7px 9px', flex: 1, minWidth: 0, ...(flagged ? { borderColor: outdated ? 'var(--danger)' : 'var(--warning)' } : undefined) }}
                />
                {hasSuggestions && (
                  <datalist id={datalistId}>
                    {field.validationOptions!.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                )}
              </div>
              {/* The one place this app shows a rule-check result right
                  next to the field it's actually about, per explicit
                  direction ("show a warning near the field for
                  reviewers") — not just as a generic banner elsewhere on
                  the page. Also where the "Submit OCR corrections"
                  button's click handler scrolls to (see OcrEditor's
                  `handleConfirmOcr`), so it's always in view the moment
                  it appears, not just when it happens to be on screen
                  already. */}
              {outdated && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    marginLeft: 134,
                    padding: '6px 9px',
                    borderRadius: 6,
                    background: 'var(--danger-tint)',
                    color: 'var(--danger)',
                    fontSize: 10.5,
                    fontWeight: 500,
                  }}
                >
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                  {outdated.message}
                </div>
              )}
              {unparseable && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    marginLeft: 134,
                    padding: '6px 9px',
                    borderRadius: 6,
                    background: 'var(--warning-tint)',
                    color: 'var(--warning)',
                    fontSize: 10.5,
                    fontWeight: 500,
                  }}
                >
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                  Couldn't verify this as a date (expected dd/mm/yyyy) — double-check the format.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TableSection({
  section,
  onCellChange,
  onAddRow,
  onRemoveRow,
}: {
  section: Extract<OcrSection, { kind: 'table' }>
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void
  onAddRow: () => void
  onRemoveRow: (rowIndex: number) => void
}) {
  return (
    <div>
      <SectionTitle
        action={
          <button
            onClick={onAddRow}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 11, fontWeight: 500, color: 'var(--accent)' }}
          >
            <Plus size={12} />
            Add row
          </button>
        }
      >
        {section.title}
      </SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${section.columns.length - 1}, 1fr) 18px`, gap: 8, padding: '0 2px' }}>
          {section.columns.map((c, i) => (
            <span key={i} style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {c}
            </span>
          ))}
          <span />
        </div>

        {section.rows.map((row) => {
          const isNew = row.rowIndex <= 0
          return (
            <div
              key={row.rowIndex}
              style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${section.columns.length - 1}, 1fr) 18px`, gap: 8, alignItems: 'center' }}
            >
              {section.columns.map((_, cIdx) => (
                <input
                  key={cIdx}
                  value={row.cells[cIdx] ?? ''}
                  onChange={(e) => onCellChange(row.rowIndex, cIdx, e.target.value)}
                  style={{ ...fieldBoxStyle, padding: '6px 8px', fontSize: 12 }}
                />
              ))}
              {isNew ? (
                <button onClick={() => onRemoveRow(row.rowIndex)} title="Remove this row" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                  <X size={13} />
                </button>
              ) : (
                <span />
              )}
            </div>
          )
        })}

        {section.rows.some((r) => r.rowIndex <= 0) && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>New rows save with the rest of your changes on Submit.</span>
        )}
      </div>
    </div>
  )
}

const CALCULATOR_ROWS: { key: keyof PayslipCalculatorInputs; label: string; hint?: string }[] = [
  { key: 'taxableIncomeExpr', label: 'Taxable Income' },
  { key: 'nonTaxableIncomeExpr', label: 'Non-Taxable Income' },
  { key: 'deductionExpr', label: 'Deduction' },
  { key: 'sssExpr', label: 'SSS Premium', hint: 'syncs into SSS Premium above' },
  { key: 'philHealthExpr', label: 'PhilHealth Premium', hint: 'syncs into PhilHealth Premium above' },
]

/** Payslip-only, per explicit direction — Taxable Income, Non-Taxable
 * Income, and Deduction are brand new fields that exist ONLY here, never
 * in the real OCR sheet (see usePortal.ts's `payslipCalculator` comment
 * for why that's a structural guarantee). SSS Premium and PhilHealth
 * Premium are real fields (rendered normally above, in Salary Details)
 * that also get this same "type a sum, see the total" convenience —
 * their computed value syncs into the real field, this expression input
 * itself doesn't.
 *
 * Each row is two inputs, per explicit direction: the reviewer types a
 * plain sum like "100+100" on the left, the evaluated total shows on
 * the right — see lib/calculator.ts `evaluateExpression`. Gross Salary
 * (Taxable + Non-Taxable) and Net Salary (Gross − Deduction) above
 * recompute automatically once their inputs here are used; see
 * lib/payslipCalc.ts `computePayslipAutoFields` for the exact
 * activation rules (an untouched calculator never overwrites a real,
 * OCR-extracted Gross/Net with a guessed zero). */
function PayslipCalculatorSection({ calculator, onChange }: { calculator: PayslipCalculatorInputs; onChange: (field: keyof PayslipCalculatorInputs, value: string) => void }) {
  return (
    <div>
      <SectionTitle>Salary Calculator</SectionTitle>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -4, marginBottom: 10 }}>
        Portal only — never written to the OCR sheet. Type a sum (e.g. "100+100") and the total fills in on the right;
        Gross Salary and Net Salary above pick it up automatically once you use Taxable/Non-Taxable Income or Deduction.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CALCULATOR_ROWS.map((row) => {
          const computed = evaluateExpression(calculator[row.key])
          return (
            <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: 124, flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{row.label}</span>
                {row.hint && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{row.hint}</span>}
              </div>
              <input
                value={calculator[row.key]}
                onChange={(e) => onChange(row.key, e.target.value)}
                placeholder="e.g. 100+100"
                style={{ ...fieldBoxStyle, padding: '7px 9px', flex: 1, minWidth: 0 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>=</span>
              <div
                style={{
                  ...fieldBoxStyle,
                  padding: '7px 9px',
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--bg-subtle)',
                  color: computed !== null ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {computed !== null ? formatComputed(computed) : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
