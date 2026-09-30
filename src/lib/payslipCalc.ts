// Payslip-specific automatic calculations, per explicit direction:
//   - Duration, derived from Salary Period Start/End Date.
//   - Gross Salary = Taxable Income + Non-Taxable Income.
//   - A calculated Net Pay reference (Gross Salary - Deduction) — NOT
//     written into the real Net Salary field. That field keeps whatever
//     the document itself declares ("declared"); the calculated figure
//     is shown alongside it purely for comparison, and is what
//     `checkNetPayConsistency` checks the declared value against,
//     auto-marking "Total Inconsistent" in Fraud Reason on a mismatch
//     (never a rejection — see that function's own comments).
//   - SSS Premium / PhilHealth Premium get the same "type a sum, see the
//     total" calculator convenience as Taxable/Non-Taxable/Deduction,
//     even though they don't feed into Gross/Net.
// Taxable Income, Non-Taxable Income, and Deduction are NEW fields that
// exist only in this portal — never in the real OCR sheet (see
// usePortal.ts's `payslipCalculator` state comment for how that's kept
// a structural guarantee, not just a convention). Everything in this
// file is pure — no React — so it's directly testable from
// scripts/verify-parser.ts.

import { evaluateExpression, formatComputed } from './calculator'
import { findField, parseDdMmYyyy } from './ruleChecks'
import type { OcrSection } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** The real OCR field labels this feature reads/writes. Exact strings,
 * confirmed against both the discovery notes and lib/mockData.ts's
 * fixtures. */
export const PAYSLIP_DATE_FIELDS = {
  start: 'Salary Period Start Date',
  end: 'Salary Period End Date',
  duration: 'Duration',
} as const

export const PAYSLIP_SALARY_FIELDS = {
  grossSalary: 'Gross Salary',
  netSalary: 'Net Salary',
  sssPremium: 'SSS Premium',
  philHealthPremium: 'PhilHealth Premium',
} as const

/** Every real field this module auto-fills, in one place — so a caller
 * (usePortal.ts) or a UI badge (OcrEditor.tsx) can check membership
 * without repeating the list. Net Salary is deliberately NOT here: per
 * explicit direction, the real field keeps whatever the document itself
 * declares ("declared") and is never overwritten — see
 * `PayslipAutoFields.calculatedNetPay` and `checkNetPayConsistency`
 * below for the calculator's own reference figure instead. */
export const PAYSLIP_AUTO_FIELD_LABELS: readonly string[] = [
  PAYSLIP_DATE_FIELDS.duration,
  PAYSLIP_SALARY_FIELDS.grossSalary,
  PAYSLIP_SALARY_FIELDS.sssPremium,
  PAYSLIP_SALARY_FIELDS.philHealthPremium,
]

/** Inclusive day count between Salary Period Start/End Date (both
 * dd/mm/yyyy) — confirmed against real fixture data: 01/08/2026 to
 * 15/08/2026 reads back as Duration "15", i.e. end minus start PLUS
 * one, not a plain difference. Null for an unparseable date on either
 * side, or an end date before the start date (nonsensical — this never
 * guesses, it just leaves Duration alone in that case). */
export function computeDurationDays(startValue: string, endValue: string): number | null {
  const start = parseDdMmYyyy(startValue)
  const end = parseDdMmYyyy(endValue)
  if (!start || !end) return null
  const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  if (diffDays < 0) return null
  return diffDays + 1
}

/** Portal-only inputs for the "calculator" fields — deliberately NOT
 * part of OcrSection/draftSections at all (see usePortal.ts), so they
 * structurally cannot end up in buildFieldEdits' Sheets write-back.
 * Each is a raw arithmetic expression the reviewer types (e.g.
 * "100+100"); `computePayslipAutoFields` evaluates them. */
export interface PayslipCalculatorInputs {
  taxableIncomeExpr: string
  nonTaxableIncomeExpr: string
  deductionExpr: string
  sssExpr: string
  philHealthExpr: string
}

export const EMPTY_PAYSLIP_CALCULATOR: PayslipCalculatorInputs = {
  taxableIncomeExpr: '',
  nonTaxableIncomeExpr: '',
  deductionExpr: '',
  sssExpr: '',
  philHealthExpr: '',
}

export interface PayslipAutoFields {
  /** null means "nothing to sync right now" — the source (dates, or a
   * calculator expression) is blank or didn't parse, so the real field
   * should be left exactly as it is rather than overwritten with a
   * guess (or, worse, a silent zero). */
  duration: string | null
  grossSalary: string | null
  /** The calculator's own reference figure (Taxable + Non-Taxable −
   * Deduction) — per explicit direction, this is deliberately NEVER
   * written into the real "Net Salary" OCR field (see
   * `PAYSLIP_AUTO_FIELD_LABELS`'s comment). The real field keeps
   * whatever the document itself declares; this is shown alongside it
   * purely for the reviewer to compare by eye, and is what
   * `checkNetPayConsistency` below checks the declared value against. */
  calculatedNetPay: string | null
  sssPremium: string | null
  philHealthPremium: string | null
}

/** Shared by `computePayslipAutoFields` (below) and
 * `checkNetPayConsistency` (further down) so the Gross/Net formula lives
 * in exactly one place. Gross only computes once the reviewer has
 * engaged with at least one of Taxable/Non-Taxable Income — an untouched
 * calculator must never silently imply a Gross/Net of "0". Net only
 * computes once Gross is computing too, per the explicit formula
 * (Net = Gross − Deduction): Deduction alone, with neither income field
 * touched, has no Gross to subtract from, so it's left alone rather than
 * guessed. */
function computeCalculatorGrossNet(calculator: PayslipCalculatorInputs): { gross: number | null; net: number | null } {
  const taxable = evaluateExpression(calculator.taxableIncomeExpr)
  const nonTaxable = evaluateExpression(calculator.nonTaxableIncomeExpr)
  const deduction = evaluateExpression(calculator.deductionExpr)

  const grossActive = taxable !== null || nonTaxable !== null
  const gross = grossActive ? (taxable ?? 0) + (nonTaxable ?? 0) : null
  const net = grossActive ? (gross ?? 0) - (deduction ?? 0) : null
  return { gross, net }
}

/** Pure computation of what each auto-fillable real field's value
 * SHOULD be right now, given the two live inputs: the OCR date fields'
 * current values, and the calculator's current expressions. */
export function computePayslipAutoFields(
  salaryPeriodStart: string | null,
  salaryPeriodEnd: string | null,
  calculator: PayslipCalculatorInputs,
): PayslipAutoFields {
  const duration = salaryPeriodStart != null && salaryPeriodEnd != null ? computeDurationDays(salaryPeriodStart, salaryPeriodEnd) : null
  const { gross, net } = computeCalculatorGrossNet(calculator)
  const sss = evaluateExpression(calculator.sssExpr)
  const philHealth = evaluateExpression(calculator.philHealthExpr)

  return {
    duration: duration != null ? String(duration) : null,
    grossSalary: gross != null ? formatComputed(gross) : null,
    calculatedNetPay: net != null ? formatComputed(net) : null,
    sssPremium: sss != null ? formatComputed(sss) : null,
    philHealthPremium: philHealth != null ? formatComputed(philHealth) : null,
  }
}

/** The exact Fraud Reason string this check writes — must match the
 * real taxonomy's text exactly, same requirement as
 * `OUTDATED_DOCUMENT_REASON` in ruleChecks.ts (confirmed present, spelled
 * exactly this way, in lib/taxonomy.ts's `FALLBACK_TAXONOMY.fraudReasons`
 * — that list is the user-provided source of truth for the live sheet's
 * actual Fraud Reason dropdown). */
export const TOTAL_INCONSISTENT_FRAUD_REASON = 'Total Inconsistent'

/** How far apart declared and calculated Net Salary can be before this
 * counts as a genuine mismatch rather than a cent or two of rounding
 * slop between however the OCR pipeline formatted its number and
 * `formatComputed`'s own rounding. */
const NET_PAY_MATCH_TOLERANCE = 0.01

/** Declared OCR amounts are plain numbers in every fixture seen so far
 * (no currency symbols), but may carry commas/whitespace or the
 * force-text `'` prefix a value gets written back with after a submit
 * (see ocrParser.ts `forceTextIfDateOrNumeric`) — strip both before
 * parsing, same convention as `parseDdMmYyyy`'s leading-`'` handling. */
function parseDeclaredAmount(value: string): number | null {
  const cleaned = value.trim().replace(/^'/, '').replace(/[,%\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export type NetPayConsistencyResult =
  | { status: 'not-applicable' }
  | { status: 'unavailable' }
  | { status: 'match'; declared: number; calculated: number }
  | { status: 'mismatch'; declared: number; calculated: number }

/** Compares the real, OCR-declared Net Salary field against the
 * calculator's own reference figure (Taxable + Non-Taxable − Deduction).
 * Per explicit direction this is a soft signal, never a rejection — a
 * mismatch only ever gets surfaced as a Fraud Reason (see
 * usePortal.ts's `confirmOcrFields`); Category/Status are left
 * completely untouched, unlike `checkOutdatedDocument`.
 *
 * `unavailable` covers both "nothing to compare yet" cases — the
 * declared field is blank/non-numeric, or the reviewer hasn't engaged
 * the calculator at all (the same `grossActive` gate
 * `computeCalculatorGrossNet` uses) — so an untouched calculator never
 * produces a false mismatch against a real declared value. */
export function checkNetPayConsistency(baseDocType: string, sections: OcrSection[], calculator: PayslipCalculatorInputs): NetPayConsistencyResult {
  if (baseDocType !== 'payslip') return { status: 'not-applicable' }

  const declaredField = findField(sections, PAYSLIP_SALARY_FIELDS.netSalary)
  const declared = declaredField ? parseDeclaredAmount(declaredField.value) : null
  const { net: calculated } = computeCalculatorGrossNet(calculator)

  if (declared === null || calculated === null) return { status: 'unavailable' }

  return Math.abs(declared - calculated) > NET_PAY_MATCH_TOLERANCE
    ? { status: 'mismatch', declared, calculated }
    : { status: 'match', declared, calculated }
}

/** A salary period longer than a calendar month is almost always a sign
 * the underlying dates are wrong, not a real pay period — per explicit
 * direction, this is purely informational: it takes no action at all
 * (no Fraud Reason, no rejection), just tells the reviewer so they can
 * decide for themselves whether to correct the OCR dates or flag
 * "Date Inconsistent" in Fraud Reason. */
export const DURATION_WARNING_THRESHOLD_DAYS = 31

export type DurationCheckResult =
  | { status: 'not-applicable' }
  | { status: 'unavailable' }
  | { status: 'ok'; duration: number }
  | { status: 'too-long'; duration: number }
  | { status: 'negative'; duration: number }

/** Checks whatever is CURRENTLY in the Duration field — however it got
 * there, auto-computed from the two date fields or typed directly by
 * the reviewer. `unavailable` covers a blank or non-numeric value
 * (nothing to warn about yet, not a false flag).
 *
 * `negative` covers zero and below, not just strictly-negative numbers —
 * a zero-day pay period is exactly as nonsensical as a negative one, and
 * the real taxonomy's own "Duration <= 0" rejection reason (see
 * lib/taxonomy.ts) draws the line at the same place. `computeDurationDays`
 * itself can never produce this (it returns null rather than a negative
 * number when the dates are out of order — see `checkSalaryPeriodRange`
 * below for THAT check), so this only ever fires when the reviewer has
 * typed a value directly into Duration; still worth checking, since
 * nothing else in this app stops them from typing "-5" into a free-text
 * field. */
export function checkDurationReasonable(baseDocType: string, sections: OcrSection[]): DurationCheckResult {
  if (baseDocType !== 'payslip') return { status: 'not-applicable' }

  const field = findField(sections, PAYSLIP_DATE_FIELDS.duration)
  const duration = field ? parseDeclaredAmount(field.value) : null
  if (duration === null) return { status: 'unavailable' }

  if (duration <= 0) return { status: 'negative', duration }
  return duration > DURATION_WARNING_THRESHOLD_DAYS ? { status: 'too-long', duration } : { status: 'ok', duration }
}

export type DateRangeCheckResult =
  | { status: 'not-applicable' }
  | { status: 'unavailable' }
  | { status: 'ok' }
  | { status: 'invalid-range' }

/** Checks Salary Period Start/End Date DIRECTLY against each other —
 * independent of whatever the Duration field currently shows. This
 * matters specifically because `computeDurationDays` returns null (not a
 * negative number) when the dates are out of order, and
 * `syncComputedField` treats null as "leave the real field alone" (see
 * usePortal.ts) — so if a reviewer edits Start Date to fall after an
 * unchanged End Date, Duration silently keeps showing its LAST valid
 * (and now stale/meaningless) value instead of updating, with nothing
 * else in this app ever pointing out that the two dates themselves
 * don't make sense. This check exists purely to catch that: it reads
 * the two date fields itself, not the Duration field. `unavailable`
 * covers a blank/unparseable date on either side — nothing to compare
 * yet, not a false flag. Purely informational, same as
 * `checkDurationReasonable` — takes no action of its own. */
export function checkSalaryPeriodRange(baseDocType: string, sections: OcrSection[]): DateRangeCheckResult {
  if (baseDocType !== 'payslip') return { status: 'not-applicable' }

  const startField = findField(sections, PAYSLIP_DATE_FIELDS.start)
  const endField = findField(sections, PAYSLIP_DATE_FIELDS.end)
  const start = startField ? parseDdMmYyyy(startField.value) : null
  const end = endField ? parseDdMmYyyy(endField.value) : null
  if (!start || !end) return { status: 'unavailable' }

  return start.getTime() > end.getTime() ? { status: 'invalid-range' } : { status: 'ok' }
}
