// Automatic per-document-type rule checks, run against the reviewer's
// OWN corrected OCR values — never the raw, possibly-misread OCR output.
// See usePortal.ts's `confirmOcrFields`: this module only ever gets
// called when a reviewer explicitly clicks the "Submit OCR corrections"
// button at the end of the OCR editor, specifically so a mis-OCR'd date
// (a very real failure mode — see forceTextIfDateOrNumeric's own
// comments) never triggers a false "Outdated Document" flag before the
// reviewer has had a chance to fix it.

import type { OcrField, OcrSection } from './types'

/** Every OCR date in this app's sheets is written/read as dd/mm/yyyy —
 * per explicit direction, an OCR date the reviewer hasn't touched is
 * already correct in that convention at the source (see
 * ocrParser.ts `forceTextIfDateOrNumeric`'s comments), so this never
 * tries to guess mm/dd vs dd/mm. Tolerates a leading `'` (the force-text
 * prefix a date gets written back with after one submit) and `-` as an
 * alternative separator. Returns null for anything that doesn't
 * cleanly parse as a real calendar date — including a nonsense date
 * like 31/02/2026, which `Date` would otherwise silently roll over into
 * March. */
export function parseDdMmYyyy(value: string): Date | null {
  const trimmed = value.trim().replace(/^'/, '')
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Whole days between a parsed date and `reference` (defaults to now),
 * both truncated to midnight first so this doesn't depend on what time
 * of day the reviewer happens to be working. Positive when `date` is in
 * the past. */
export function daysSince(date: Date, reference: Date = new Date()): number {
  const referenceUtcMidnight = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate())
  return Math.floor((referenceUtcMidnight - date.getTime()) / MS_PER_DAY)
}

/** The exact rejection-reason string this rule writes — must match the
 * real taxonomy's text exactly (confirmed present, spelled exactly this
 * way, in all four document types' Ref-tab columns on the live master
 * sheet), since it's written straight into `DecisionDraft.rejectionReason`
 * and needs to land on a real option in the Rejection Reason dropdown,
 * not an orphaned custom value. */
export const OUTDATED_DOCUMENT_REASON = 'Outdated Document'

export const OUTDATED_THRESHOLD_DAYS = 60

/** Which OCR field each base document type's "is this outdated?" check
 * looks at. Keyed by `taxonomy.ts` `baseDocType` (payslip/credit/loan/
 * coe), not the exact "payslip_0"/"payslip_1" tab name — both pages of
 * a multi-page document get the same rule, each checked independently
 * against its own field value. Only the two document types actually
 * asked for are listed; any other type's check is simply
 * `not-applicable` (see checkOutdatedDocument), not an error — this is
 * the natural place to add another type's date field later. */
const OUTDATED_DATE_FIELD_BY_DOC_TYPE: Record<string, string> = {
  payslip: 'Salary Period End Date',
  coe: 'Document Issued Date',
}

function findField(sections: OcrSection[], label: string): OcrField | null {
  for (const section of sections) {
    if (section.kind !== 'fields') continue
    const match = section.fields.find((f) => f.label === label)
    if (match) return match
  }
  return null
}

export type OutdatedCheckResult =
  | { status: 'not-applicable' }
  | { status: 'unparseable'; fieldLabel: string }
  | { status: 'ok'; fieldLabel: string; daysOld: number }
  | { status: 'outdated'; fieldLabel: string; daysOld: number; message: string }

/** Runs the one rule check this app currently has: is the relevant date
 * field (per document type, see the map above) more than
 * `OUTDATED_THRESHOLD_DAYS` days in the past? Always safe to call — a
 * document type with no rule, a field that's missing from the OCR
 * document entirely, or a value that doesn't parse as a dd/mm/yyyy date
 * all come back as a non-`outdated` status rather than throwing, so a
 * bad OCR read (or a document type this doesn't cover yet) never
 * crashes the "Submit OCR corrections" flow — it just means nothing to
 * flag, or nothing this rule can verify. */
export function checkOutdatedDocument(baseDocType: string, sections: OcrSection[], today: Date = new Date()): OutdatedCheckResult {
  const fieldLabel = OUTDATED_DATE_FIELD_BY_DOC_TYPE[baseDocType]
  if (!fieldLabel) return { status: 'not-applicable' }

  const field = findField(sections, fieldLabel)
  const parsed = field ? parseDdMmYyyy(field.value) : null
  if (!parsed) return { status: 'unparseable', fieldLabel }

  const daysOld = daysSince(parsed, today)
  if (daysOld > OUTDATED_THRESHOLD_DAYS) {
    return {
      status: 'outdated',
      fieldLabel,
      daysOld,
      message: `${fieldLabel} is ${daysOld} days old — over the ${OUTDATED_THRESHOLD_DAYS}-day limit, so this was flagged as ${OUTDATED_DOCUMENT_REASON}.`,
    }
  }
  return { status: 'ok', fieldLabel, daysOld }
}
