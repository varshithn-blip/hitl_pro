import { useRef } from 'react'
import { evaluateExpression, formatComputed } from '../lib/calculator'
import {
  PAYSLIP_AUTO_FIELD_LABELS,
  PAYSLIP_DATE_FIELDS,
  PAYSLIP_SALARY_FIELDS,
  type DateRangeCheckResult,
  type DurationCheckResult,
  type NetPayConsistencyResult,
  type PayslipCalculatorInputs,
} from '../lib/payslipCalc'
import type { OutdatedCheckResult } from '../lib/ruleChecks'
import { baseDocType } from '../lib/taxonomy'
import type { OcrSection } from '../lib/types'
import type { ConfirmOcrResult } from '../hooks/usePortal'
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
  /** Result of the last Submit click's Net Pay declared-vs-calculated
   * comparison (Payslip only) — same null-until-clicked-or-stale
   * lifecycle as `checkResult`, but independent of it (see
   * usePortal.ts's `confirmOcrFields`). Passed through to
   * `FieldsSection` so it can show the outcome right next to the real
   * "Net Salary" field. */
  netPayCheckResult: NetPayConsistencyResult | null
  /** The calculator's live reference Net Pay figure (Payslip only) —
   * unlike `netPayCheckResult`, this updates on every calculator
   * keystroke, not just on Submit, so the reviewer can compare it
   * against the declared field at any time before ever clicking Submit. */
  calculatedNetPay: string | null
  /** Result of the last Submit click's Duration sanity check (Payslip
   * only) — same lifecycle as `checkResult`/`netPayCheckResult`, but
   * purely informational: it never marks anything, it's just shown next
   * to the Duration field for the reviewer to notice and decide for
   * themselves (see usePortal.ts's `checkDurationReasonable`). */
  durationCheckResult: DurationCheckResult | null
  /** Result of the last Submit click's Salary Period Start/End Date range
   * check (Payslip only) — same lifecycle and purely-informational
   * nature as `durationCheckResult`, but reads the two date fields
   * directly rather than the Duration field (see usePortal.ts's
   * `checkSalaryPeriodRange`), so it still catches a start-after-end
   * date order even if Duration is currently showing a stale value. */
  dateRangeCheckResult: DateRangeCheckResult | null
  /** Runs all four checks and returns their results synchronously — see
   * this component's own submit handler below, which uses the return
   * value (not a separate effect on the stored results) to decide
   * whether to scroll to a flagged field or hand off to
   * `onNavigateToDecision`. */
  onConfirmOcr: () => ConfirmOcrResult | null
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
  netPayCheckResult,
  calculatedNetPay,
  durationCheckResult,
  dateRangeCheckResult,
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
  // themselves. A Net Pay mismatch gets the same treatment — scrolled to
  // the real Net Salary field, since it's a fraud signal getting quietly
  // added to a Decision-tab popover the reviewer might otherwise never
  // notice. An invalid Salary Period date range, or a Duration that's
  // too long or not positive, get it too, purely so the reviewer
  // actually sees the heads-up (neither takes any action of its own —
  // see checkSalaryPeriodRange/checkDurationReasonable). Priority when
  // more than one fires on the same click: outdated-document first (a
  // more foundational problem — the document itself may not even be
  // current), then the date-range check (equally foundational — nothing
  // else here makes sense if the two dates are out of order), then Net
  // Pay mismatch (an auto-added Fraud Reason, so it must not go
  // unnoticed), then Duration (informational only, and often moot once
  // the date range itself is fixed). Anything else — every check clean,
  // or a document type none of them apply to — has nothing left for the
  // reviewer to look at here, so it advances them straight to Decision.
  const handleConfirmOcr = () => {
    const result = onConfirmOcr()
    if (!result) return
    if (result.outdated.status === 'outdated' || result.outdated.status === 'unparseable') {
      fieldRefs.current.get(result.outdated.fieldLabel)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (result.dateRange.status === 'invalid-range') {
      fieldRefs.current.get(PAYSLIP_DATE_FIELDS.end)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (result.netPay.status === 'mismatch') {
      fieldRefs.current.get(PAYSLIP_SALARY_FIELDS.netSalary)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (result.duration.status === 'too-long' || result.duration.status === 'negative') {
      fieldRefs.current.get(PAYSLIP_DATE_FIELDS.duration)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      onNavigateToDecision()
    }
  }

  return (
    <div className="rd-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.map((section, sIdx) =>
        section.kind === 'fields' ? (
          <FieldsSection
            key={sIdx}
            section={section}
            onFieldChange={(fIdx, v) => onFieldChange(sIdx, fIdx, v)}
            checkResult={checkResult}
            netPayCheckResult={netPayCheckResult}
            calculatedNetPay={calculatedNetPay}
            durationCheckResult={durationCheckResult}
            dateRangeCheckResult={dateRangeCheckResult}
            registerFieldRef={registerFieldRef}
          />
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
        <DateRangeCheckStatus result={dateRangeCheckResult} />
        <NetPayCheckStatus result={netPayCheckResult} />
        <DurationCheckStatus result={durationCheckResult} />
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

/** The Net Pay check's own feedback line, alongside `CheckResultStatus`
 * above — independent check, independent line. Silent for
 * 'not-applicable' (non-Payslip doc types) and 'unavailable' (nothing to
 * compare yet: a blank/non-numeric declared value, or a calculator the
 * reviewer hasn't touched) since there's nothing meaningful to report in
 * either case. */
function NetPayCheckStatus({ result }: { result: NetPayConsistencyResult | null }) {
  if (!result || result.status === 'not-applicable' || result.status === 'unavailable') return null
  if (result.status === 'match') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, color: 'var(--success)' }}>
        <Check size={11} />
        Declared Net Salary matches the calculated reference.
      </span>
    )
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--danger)' }}>
      <AlertTriangle size={11} />
      Declared/calculated Net Salary don't match — flagged "Total Inconsistent" in Fraud Reason, scrolled up to it above.
    </span>
  )
}

/** The Duration check's own feedback line. Deliberately never uses the
 * danger/red styling the other two marking checks use for their
 * "something's wrong" state — per explicit direction this one takes no
 * action at all, so it stays at warning/amber severity throughout,
 * matching the inline banner below. Silent for 'not-applicable' and
 * 'unavailable' (blank/non-numeric Duration — nothing to warn about
 * yet), same as the other status lines. */
function DurationCheckStatus({ result }: { result: DurationCheckResult | null }) {
  if (!result || result.status === 'not-applicable' || result.status === 'unavailable') return null
  if (result.status === 'ok') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, color: 'var(--success)' }}>
        <Check size={11} />
        Duration ({result.duration} days) looks reasonable.
      </span>
    )
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--warning)' }}>
      <AlertTriangle size={11} />
      {result.status === 'negative'
        ? `Duration is ${result.duration} days — not a valid pay period, scrolled up to it above.`
        : `Duration is ${result.duration} days — over 31, scrolled up to it above.`}
    </span>
  )
}

/** The Salary Period Start/End Date range check's own feedback line —
 * same warning/amber-only severity as `DurationCheckStatus` above, for
 * the same reason (purely informational, never marks anything). Silent
 * for 'not-applicable' and 'unavailable' (a blank/unparseable date on
 * either side — nothing to compare yet). */
function DateRangeCheckStatus({ result }: { result: DateRangeCheckResult | null }) {
  if (!result || result.status === 'not-applicable' || result.status === 'unavailable') return null
  if (result.status === 'ok') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, color: 'var(--success)' }}>
        <Check size={11} />
        Salary Period dates are in order.
      </span>
    )
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--warning)' }}>
      <AlertTriangle size={11} />
      Salary Period Start Date is after End Date — scrolled up to it above.
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
  netPayCheckResult,
  calculatedNetPay,
  durationCheckResult,
  dateRangeCheckResult,
  registerFieldRef,
}: {
  section: Extract<OcrSection, { kind: 'fields' }>
  onFieldChange: (fieldIndex: number, value: string) => void
  checkResult: OutdatedCheckResult | null
  netPayCheckResult: NetPayConsistencyResult | null
  calculatedNetPay: string | null
  durationCheckResult: DurationCheckResult | null
  dateRangeCheckResult: DateRangeCheckResult | null
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
          // Net Salary is the one "declared" field this app compares
          // against a calculator-derived reference — see
          // checkNetPayConsistency in payslipCalc.ts. Never true for any
          // other document type's schema, since this exact label doesn't
          // exist there.
          const isNetSalaryField = field.label === PAYSLIP_SALARY_FIELDS.netSalary
          const netPayMismatch = isNetSalaryField && netPayCheckResult?.status === 'mismatch'
          // Duration is the one field checkDurationReasonable ever looks
          // at — same "only exists on Payslip's schema" reasoning as
          // isNetSalaryField above. Covers both "problem" outcomes (too
          // long, or zero/negative) in one banner — see its rendering
          // below for the per-status message.
          const isDurationField = field.label === PAYSLIP_DATE_FIELDS.duration
          const durationProblem =
            isDurationField && (durationCheckResult?.status === 'too-long' || durationCheckResult?.status === 'negative') ? durationCheckResult : null
          // Salary Period End Date is where checkSalaryPeriodRange's
          // warning shows — chosen over Start Date only because it's the
          // later of the two fields in this schema, so the banner reads
          // naturally as "these two dates, together, don't make sense."
          const isEndDateField = field.label === PAYSLIP_DATE_FIELDS.end
          const dateRangeInvalid = isEndDateField && dateRangeCheckResult?.status === 'invalid-range'
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
                      title="Kept in sync automatically — Duration from Salary Period Start/End Date above, Gross/SSS/PhilHealth from the Salary Calculator below. Still a normal editable field: typing over it sticks until its own source changes again."
                      style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--success)', cursor: 'help' }}
                    >
                      ⟳ AUTO
                    </span>
                  )}
                  {isNetSalaryField && (
                    <span
                      title="This is the document's own declared Net Salary — never overwritten. Compared against the calculator's reference figure below on Submit."
                      style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-muted)', cursor: 'help' }}
                    >
                      DECLARED
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
                  style={{
                    ...fieldBoxStyle,
                    padding: '7px 9px',
                    flex: 1,
                    minWidth: 0,
                    ...(flagged
                      ? { borderColor: outdated ? 'var(--danger)' : 'var(--warning)' }
                      : dateRangeInvalid
                        ? { borderColor: 'var(--warning)' }
                        : netPayMismatch
                          ? { borderColor: 'var(--danger)' }
                          : durationProblem
                            ? { borderColor: 'var(--warning)' }
                            : undefined),
                  }}
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
              {/* Purely informational, per explicit direction: this
                  never marks anything — it just tells the reviewer the
                  Salary Period dates are out of order (Start Date after
                  End Date), which is also WHY Duration above might not
                  have updated (computeDurationDays leaves a stale value
                  in place rather than guessing — see
                  checkSalaryPeriodRange's own comments). */}
              {dateRangeInvalid && (
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
                  Salary Period Start Date is after this End Date — check both fields (Duration above may be stale until this is fixed).
                </div>
              )}
              {/* The declared-vs-calculated comparison for Net Salary,
                  per explicit direction: the real field always keeps the
                  document's own declared value, and this reference row
                  is purely for the reviewer to compare it against the
                  calculator's own figure by eye — visible as soon as the
                  calculator has anything to show, well before "Submit
                  OCR corrections" is ever clicked. A mismatch after
                  Submit escalates this exact row into the same
                  red-bordered-banner treatment as the outdated-document
                  check above (still just a Fraud Reason, never a
                  rejection — see checkNetPayConsistency). */}
              {isNetSalaryField && calculatedNetPay !== null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    marginLeft: 134,
                    padding: '6px 9px',
                    borderRadius: 6,
                    background: netPayMismatch ? 'var(--danger-tint)' : 'var(--bg-subtle)',
                    color: netPayMismatch ? 'var(--danger)' : 'var(--text-muted)',
                    fontSize: 10.5,
                    fontWeight: netPayMismatch ? 500 : 400,
                  }}
                >
                  {netPayMismatch && <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />}
                  {netPayMismatch
                    ? `Calculated: ${calculatedNetPay} — doesn't match the declared value above. Flagged "Total Inconsistent" in Fraud Reason.`
                    : `Calculated (reference only, from the Salary Calculator below): ${calculatedNetPay}`}
                </div>
              )}
              {/* Purely informational, per explicit direction: this
                  never marks anything (no Fraud Reason, no rejection) —
                  it just tells the reviewer Duration looks wrong (either
                  over a month long, or not a positive number at all) and
                  leaves the call (correct the OCR dates or Duration
                  itself, or flag "Date Inconsistent" in Fraud Reason)
                  entirely up to them. */}
              {durationProblem && (
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
                  {durationProblem.status === 'negative'
                    ? `Duration is ${durationProblem.duration} days — a pay period can't be zero or negative days. Correct the dates or this field, or flag "Date Inconsistent" in Fraud Reason — your call.`
                    : `Duration is ${durationProblem.duration} days — over 31, which usually means the date range isn't correct. Correct the OCR dates, or flag "Date Inconsistent" in Fraud Reason — your call.`}
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
 * above recomputes automatically (Taxable + Non-Taxable) once these
 * inputs are used; see lib/payslipCalc.ts `computePayslipAutoFields` for
 * the exact activation rules (an untouched calculator never overwrites a
 * real, OCR-extracted Gross Salary with a guessed zero). Net Salary is
 * NOT auto-written — per explicit direction, the real field always keeps
 * the document's own declared value; a calculated reference figure
 * (Gross − Deduction) shows next to it instead, purely for comparison —
 * see FieldsSection's own Net-Salary-specific rendering above. */
function PayslipCalculatorSection({ calculator, onChange }: { calculator: PayslipCalculatorInputs; onChange: (field: keyof PayslipCalculatorInputs, value: string) => void }) {
  return (
    <div>
      <SectionTitle>Salary Calculator</SectionTitle>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -4, marginBottom: 10 }}>
        Portal only — never written to the OCR sheet. Type a sum (e.g. "100+100") and the total fills in on the right;
        Gross Salary above picks it up automatically once you use Taxable/Non-Taxable Income or Deduction. Net Salary
        stays as declared — a calculated reference shows next to it instead, compared against it on Submit.
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
