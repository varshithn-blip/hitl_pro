// Payslip PhilHealth/SSS deduction-consistency check — a direct port of an
// existing Google Apps Script (`processPayslipPremiumFlags`), per explicit
// direction. The script ran as a post-hoc audit (a scheduled trigger
// scanning already-DECIDED rows); this instead runs synchronously inside
// the reviewer's own Submit action, against their own corrected OCR values
// — see usePortal.ts's `submit()` for the orchestration (sibling lookups,
// wiring the result into the Fraud Reason write). Everything in THIS file
// is pure — no React, no network — so it's directly testable from
// scripts/verify-parser.ts, same convention as payslipCalc.ts/ruleChecks.ts.
//
// Per explicit direction, this is informational only: it never blocks a
// submit, never touches Category/Status, and — unlike the script, which
// pairs two "S" (semi-monthly) payslips only once BOTH already have a
// decision — only ever writes to the row actually being submitted, never
// back to a sibling row.

export const PAYSLIP_DEDUCTION_FIELDS = {
  coveragePeriod: 'Coverage Period',
  basicPay: 'Basic Pay',
} as const

/** The exact Fraud Reason string the original Apps Script writes. This
 * app's own `FALLBACK_TAXONOMY.fraudReasons` (taxonomy.ts) instead has
 * "Deduction Inconsistent" (reversed word order) — and the live sheet's
 * Ref tab, whichever it actually has, can differ from either. See
 * `findFraudReasonMatch` below: the real string to write is resolved at
 * check time against whatever `taxonomy.fraudReasons` currently contains,
 * falling back to this constant only if neither word order is found live. */
export const DEDUCTION_INCONSISTENT_FALLBACK = 'Deduction Inconsistent'

/** Both word orders seen so far (this app's fallback taxonomy, and the
 * Apps Script's own string) — `findFraudReasonMatch` checks the live
 * taxonomy against both before falling back. */
export const DEDUCTION_INCONSISTENT_CANDIDATES = ['Deduction Inconsistent', 'Inconsistent Deduction']

/** PhilHealth employee share, on MONTHLY basic salary: 5% premium, 50-50
 * split = salary * 2.5%, clamped between 250 and 2500. Direct port of the
 * script's own `getPhilHealthEmployeeShare`. */
export function getPhilHealthEmployeeShare(monthlyBasicSalary: number): number {
  if (!Number.isFinite(monthlyBasicSalary) || monthlyBasicSalary <= 0) return 250
  return Math.floor(Math.max(250, Math.min(2500, monthlyBasicSalary * 0.025)))
}

export interface SssContribution {
  ss: number
  mpf: number
  total: number
}

/** SSS employee contribution, on MONTHLY basic salary — direct port of the
 * script's own 2025 SSS contribution table. Brackets are 500-wide starting
 * at 5,250: below that, flat 250; at/above 34,750, flat 1,750 (1,000 SS +
 * 750 MPF); in between, total = 275 + bracket×25, with everything up to
 * 1,000 going to SS and the remainder above 1,000 going to MPF. */
export function getSssEmployeeContribution(monthlyBasicSalary: number): SssContribution {
  if (!Number.isFinite(monthlyBasicSalary) || monthlyBasicSalary <= 0) return { ss: 250, mpf: 0, total: 250 }
  if (monthlyBasicSalary < 5250) return { ss: 250, mpf: 0, total: 250 }
  if (monthlyBasicSalary >= 34750) return { ss: 1000, mpf: 750, total: 1750 }

  const bracketIndex = Math.floor((monthlyBasicSalary - 5250) / 500)
  const total = 275 + bracketIndex * 25
  return total <= 1000 ? { ss: total, mpf: 0, total } : { ss: 1000, mpf: total - 1000, total }
}

export interface DeductionCheckInputs {
  basicPay: number
  philHealthPremium: number
  sssPremium: number
}

export type DeductionFlagReason = 'philhealth' | 'sss'

export interface DeductionOutcome {
  flagged: boolean
  reasons: DeductionFlagReason[]
}

/** Coverage Period "M" (monthly) — validate directly against the two
 * government formulas above. PhilHealth passes within [expected,
 * expected+50]; SSS passes within [total-10, total+10]. */
export function checkMonthly(inputs: DeductionCheckInputs): DeductionOutcome {
  const reasons: DeductionFlagReason[] = []

  const expectedShare = getPhilHealthEmployeeShare(inputs.basicPay)
  const phOk = inputs.philHealthPremium >= expectedShare && inputs.philHealthPremium <= expectedShare + 50
  if (!phOk) reasons.push('philhealth')

  const sss = getSssEmployeeContribution(inputs.basicPay)
  const sssOk = inputs.sssPremium >= sss.total - 10 && inputs.sssPremium <= sss.total + 10
  if (!sssOk) reasons.push('sss')

  return { flagged: reasons.length > 0, reasons }
}

/** Two "S" (semi-monthly) payslips in the same transaction, same month —
 * sum basic pay and both premiums, then validate the combined figures with
 * the exact same formula/tolerance as the monthly case above. */
export function checkPairedSemiMonthly(a: DeductionCheckInputs, b: DeductionCheckInputs): DeductionOutcome {
  return checkMonthly({
    basicPay: a.basicPay + b.basicPay,
    philHealthPremium: a.philHealthPremium + b.philHealthPremium,
    sssPremium: a.sssPremium + b.sssPremium,
  })
}

/** A single "S" payslip with no same-month pair found. Monthly-equivalent
 * basic pay = basicPay × 2. PhilHealth is checked against HALF the
 * monthly-equivalent expected range (this payslip only covers half the
 * month). SSS is checked more loosely — it passes if it matches ANY ONE of
 * total/SS-only/MPF-only (±10), since a semi-monthly cutoff might land the
 * full SSS deduction on just one half rather than splitting it evenly. */
export function checkUnpairedSemiMonthly(inputs: DeductionCheckInputs): DeductionOutcome {
  const reasons: DeductionFlagReason[] = []

  const monthlyBasicPay = inputs.basicPay * 2
  const expectedShare = getPhilHealthEmployeeShare(monthlyBasicPay)
  const expectedHalf = expectedShare / 2
  const phOk = inputs.philHealthPremium >= expectedHalf && inputs.philHealthPremium <= expectedHalf + 50
  if (!phOk) reasons.push('philhealth')

  const sss = getSssEmployeeContribution(monthlyBasicPay)
  const sssOk =
    (inputs.sssPremium >= sss.total - 10 && inputs.sssPremium <= sss.total + 10) ||
    (inputs.sssPremium >= sss.ss - 10 && inputs.sssPremium <= sss.ss + 10) ||
    (sss.mpf > 0 && inputs.sssPremium >= sss.mpf - 10 && inputs.sssPremium <= sss.mpf + 10)
  if (!sssOk) reasons.push('sss')

  return { flagged: reasons.length > 0, reasons }
}

export type DeductionCheckResult =
  | { status: 'not-applicable' } // non-Payslip, or a Payslip's first document (payslip_0) — never pairs, per explicit direction
  | { status: 'skipped' } // Coverage Period isn't "S" or "M"
  | { status: 'unavailable' } // Basic Pay / PhilHealth Premium / SSS Premium missing or non-numeric
  | { status: 'pass' }
  | { status: 'flagged'; reasons: DeductionFlagReason[] }

/** Extracts the trailing document index from a Document Type like
 * "payslip_0"/"payslip_1" — null if the string doesn't end in `_<n>`. */
export function parsePayslipDocumentIndex(documentType: string): number | null {
  const match = /_(\d+)$/.exec(documentType)
  return match ? Number(match[1]) : null
}

/** Declared OCR amounts are plain numbers in every fixture seen so far (no
 * currency symbols), but may carry commas/whitespace or the force-text `'`
 * prefix a value gets written back with after a submit — strip both before
 * parsing, same convention used throughout payslipCalc.ts/ruleChecks.ts. */
export function parseDeductionAmount(value: string): number | null {
  const cleaned = value.trim().replace(/^'/, '').replace(/[,%\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function isSameMonthYear(a: Date, b: Date): boolean {
  return a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
}

/** Resolves the real Fraud Reason string to write: matches
 * `candidates` against `available` (the live-merged taxonomy's actual
 * list, whatever it currently is) case/word-order-insensitively — so
 * "Deduction Inconsistent" and "Inconsistent Deduction" are treated as the
 * same reason regardless of which one the real sheet's dropdown actually
 * has. Returns null if neither is present in `available` at all (caller
 * falls back to `DEDUCTION_INCONSISTENT_FALLBACK`). */
export function findFraudReasonMatch(available: string[], candidates: string[]): string | null {
  const normalize = (s: string) => s.toLowerCase().trim().split(/\s+/).sort().join(' ')
  const wanted = new Set(candidates.map(normalize))
  return available.find((a) => wanted.has(normalize(a))) ?? null
}
