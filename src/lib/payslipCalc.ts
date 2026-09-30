// Payslip-specific automatic calculations, per explicit direction:
//   - Duration, derived from Salary Period Start/End Date.
//   - Gross Salary = Taxable Income + Non-Taxable Income.
//   - Net Salary = Gross Salary - Deduction.
//   - SSS Premium / PhilHealth Premium get the same "type a sum, see the
//     total" calculator convenience as the three fields above, even
//     though they don't feed into Gross/Net.
// Taxable Income, Non-Taxable Income, and Deduction are NEW fields that
// exist only in this portal — never in the real OCR sheet (see
// usePortal.ts's `payslipCalculator` state comment for how that's kept
// a structural guarantee, not just a convention). Everything in this
// file is pure — no React — so it's directly testable from
// scripts/verify-parser.ts.

import { evaluateExpression, formatComputed } from './calculator'
import { parseDdMmYyyy } from './ruleChecks'

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

/** Every real field this module can auto-fill, in one place — so a
 * caller (usePortal.ts) or a UI badge (OcrEditor.tsx) can check
 * membership without repeating the list. */
export const PAYSLIP_AUTO_FIELD_LABELS: readonly string[] = [
  PAYSLIP_DATE_FIELDS.duration,
  PAYSLIP_SALARY_FIELDS.grossSalary,
  PAYSLIP_SALARY_FIELDS.netSalary,
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
  netSalary: string | null
  sssPremium: string | null
  philHealthPremium: string | null
}

/** Pure computation of what each auto-fillable real field's value
 * SHOULD be right now, given the two live inputs: the OCR date fields'
 * current values, and the calculator's current expressions.
 *
 * Gross Salary only computes once the reviewer has engaged with at
 * least one of Taxable/Non-Taxable Income — an untouched calculator
 * must never silently override a real, OCR-extracted Gross Salary with
 * "0". Net Salary only computes once Gross is computing too, per the
 * explicit formula (Net = Gross − Deduction): Deduction alone, with
 * neither income field touched, has no Gross to subtract from, so it's
 * left alone in that case rather than guessed. */
export function computePayslipAutoFields(
  salaryPeriodStart: string | null,
  salaryPeriodEnd: string | null,
  calculator: PayslipCalculatorInputs,
): PayslipAutoFields {
  const duration = salaryPeriodStart != null && salaryPeriodEnd != null ? computeDurationDays(salaryPeriodStart, salaryPeriodEnd) : null

  const taxable = evaluateExpression(calculator.taxableIncomeExpr)
  const nonTaxable = evaluateExpression(calculator.nonTaxableIncomeExpr)
  const deduction = evaluateExpression(calculator.deductionExpr)
  const sss = evaluateExpression(calculator.sssExpr)
  const philHealth = evaluateExpression(calculator.philHealthExpr)

  const grossActive = taxable !== null || nonTaxable !== null
  const gross = grossActive ? (taxable ?? 0) + (nonTaxable ?? 0) : null
  const net = grossActive ? (gross ?? 0) - (deduction ?? 0) : null

  return {
    duration: duration != null ? String(duration) : null,
    grossSalary: gross != null ? formatComputed(gross) : null,
    netSalary: net != null ? formatComputed(net) : null,
    sssPremium: sss != null ? formatComputed(sss) : null,
    philHealthPremium: philHealth != null ? formatComputed(philHealth) : null,
  }
}
