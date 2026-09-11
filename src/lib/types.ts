// Domain types for the review portal. Field names/semantics come directly
// from the master sheet + per-transaction OCR sheets — see
// /root/.claude/plans/we-have-a-team-fancy-whisper.md for the discovery
// notes this was built from.

export type CategoryValue = 'Valid' | 'Invalid' | 'Incomplete'
/** The two decisions a reviewer can actually make, plus the sheet's own
 * pre-review default. Originally assumed the Status column started out
 * *blank* on an unreviewed row — the real prod sheet instead pre-fills it
 * with the literal text "In Progress" (found via a live filtering bug: the
 * "Pending" filter matched on an empty string and so matched nothing).
 * `'In Progress'` is never something a reviewer picks — the Decision
 * panel's Approve/Reject buttons only ever write the other two — it only
 * shows up when *reading* a row that hasn't been decided yet. */
export type StatusValue = 'In Progress' | 'Manually Approved' | 'Manually Rejected'

/** Whether a row's Status cell means "nobody has decided this yet" — true
 * both for the real sheet's "In Progress" default and for a genuinely
 * blank cell (kept as pending too, in case an older tab or edge case
 * still has one). Single source of truth for every "is this done?" check
 * in the app (the queue filter, the pending count, the grey-out styling)
 * so they can't drift out of sync with each other again. */
export function isPendingStatus(status: StatusValue | ''): boolean {
  return status === '' || status === 'In Progress'
}

/** A rendered link-chip cell (Image URL / Drive Link / Sheet URL). The
 * display text is always readable from the sheet; the real `href` requires
 * a live Sheets API read (hyperlink field / HYPERLINK() formula) — see
 * lib/sheetsApi.ts `resolveCellLink`. It's nullable because that
 * resolution is unverified until tested against the real API. */
export interface LinkCell {
  label: string
  href: string | null
}

/** One row of the master sheet = one document. */
export interface MasterRow {
  /** 1-based row number in the date tab, used to target writes — the
   * actual physical position of this row, independent of any column's
   * value, so it stays correct and row-specific regardless of what
   * follows. */
  rowIndex: number
  appId: string
  transactionId: string
  /** NOT a reliable per-row identifier ON ITS OWN — originally assumed to
   * be (per the discovery notes, "a UUID, one per document"), but found
   * live: real data has multiple rows under one transaction, even
   * different document types, sharing the exact identical Request ID.
   * Never key or match a row on this alone — see `masterRowKey`, which
   * combines it with Transaction ID and Document Type instead (a second
   * live case showed Transaction ID + Document Type alone isn't safe
   * either: one transaction can carry more than one Request ID, each
   * with its own payslip_0/payslip_1-style pair, so that pair collided
   * too). Still shown to reviewers as-is (it's a real sheet column),
   * just not trusted as a unique key by itself. */
  requestId: string
  imageUrl: LinkCell
  /** e.g. "loan_0", "loan_1", "payslip_0" — the exact OCR-tab name. */
  documentType: string
  sheetUrl: LinkCell
  category: CategoryValue | ''
  rejectionReason: string
  status: StatusValue | ''
  /** Stored in the sheet as a delimited string; parsed here since Fraud
   * Reason is multi-select. */
  fraudReason: string[]
  reviewer: string
  apiCalled: string
  driveLink: LinkCell
  flags: string
  reclassified: string
  processed: string
}

/** The composite key this app actually treats as a row's unique identity
 * — Transaction ID + Request ID + Document Type, all three together, NOT
 * any one or two of them alone (see MasterRow.requestId's comment for
 * why neither Request ID nor Transaction ID + Document Type is safe by
 * itself). Concretely, this guards against both live-confirmed
 * collisions at once:
 *   - Request ID repeating across different Document Types within one
 *     Transaction ID (the original bug report) — Document Type in the
 *     key tells those apart.
 *   - Transaction ID + Document Type repeating because one transaction
 *     carries more than one Request ID, each producing its own
 *     Document Type (e.g. two separate payslip_0/payslip_1 pairs under
 *     one Transaction ID) — Request ID in the key tells those apart.
 * The one case this still can't disambiguate is a genuine upstream
 * duplicate — the exact same document (same transaction, same request,
 * same type) uploaded and processed twice — which has no reliable
 * per-row identifier at all in this data; see README. */
export function masterRowKey(row: { transactionId: string; requestId: string; documentType: string }): string {
  return `${row.transactionId}::${row.requestId}::${row.documentType}`
}

export const MASTER_COLUMNS = [
  'App ID',
  'Transaction ID',
  'Request ID',
  'Image URL',
  'Document Type',
  'Sheet URL',
  'Category',
  'Rejection Reason',
  'Status',
  'Fraud Reason',
  'Reviewer',
  'API Called',
  'Drive Link',
  'Flags',
  'Re-classified',
  'Processed',
] as const

export type MasterColumn = (typeof MASTER_COLUMNS)[number]

/** One field inside an OCR tab's "Fields / Values [/ remark]" block. */
export interface OcrField {
  label: string
  value: string
  /** The optional 3rd-column auto-generated remark (e.g. "must have 2
   * decimal places", "ok") — present on some tabs, not others. */
  remark?: string
  /** 1-based row number within the OCR tab, for write-back. */
  rowIndex: number
  /** Live dropdown suggestions read off this field's own value cell's
   * data-validation rule (e.g. Company Category), if that specific cell
   * has one — see ocrParser.ts `attachFieldValidation`. Generic and
   * per-field (not hardcoded to one field name): whichever OCR field
   * happens to have a rule attached in the real sheet gets suggestions,
   * automatically, with no code change needed. `null`/undefined means no
   * rule was found — the field stays a plain free-text input either way,
   * since the OCR-extracted value must stay editable even when it
   * doesn't match any suggested option (this is suggestions, not a
   * locked choice — see OcrEditor.tsx). */
  validationOptions?: string[] | null
}

/** A repeating-table section, e.g. coe_0's "Salary Components". */
export interface OcrTableSection {
  kind: 'table'
  title: string
  columns: string[]
  rows: { rowIndex: number; cells: string[] }[]
}

/** A fixed key/value section, e.g. "Loan Details". */
export interface OcrFieldsSection {
  kind: 'fields'
  title: string
  fields: OcrField[]
}

export type OcrSection = OcrFieldsSection | OcrTableSection

/** The parsed contents of one OCR tab (one document within a transaction's
 * per-transaction OCR spreadsheet). */
export interface OcrDocument {
  /** `masterRowKey()` of the row this OCR document was loaded for — the
   * single source of truth for "which queue card does this data belong
   * to". NOT Request ID: found live, real rows under one transaction —
   * even different document types — can share the exact same Request ID,
   * so it can't tell two documents apart. Compare this against
   * `masterRowKey(selectedRow)`, never `requestId`, to know whether this
   * data still belongs to the row on screen. See usePortal.ts's submit()
   * for where this is actually enforced. */
  rowKey: string
  spreadsheetId: string
  tabTitle: string
  gid: number
  transactionId: string
  customerId: string
  error: string
  sections: OcrSection[]
}

export type TaxonomyFieldSource = 'sheet' | 'fallback'

export interface Taxonomy {
  category: CategoryValue[]
  /** Keyed by *base* document type (loan/payslip/credit/coe — the
   * Document Type value with any trailing "_<n>" stripped). */
  rejectionReasonsByDocType: Record<string, string[]>
  fraudReasons: string[]
  reclassifyOptions: string[]
  /** Per-field, not one blended flag — Category could come from the live
   * sheet while Rejection Reason falls back, or vice versa, and reviewers
   * need to know specifically which is which (surfaced next to each field
   * in the Decision panel) rather than one overall guess. */
  source: {
    category: TaxonomyFieldSource
    /** Per document type, not one blended flag for the whole field — each
     * type's list comes from its own column on the Ref tab independently,
     * so e.g. payslip/credit/loan could be live while coe's column is
     * missing or empty and falls back. */
    rejectionReasonByDocType: Record<string, TaxonomyFieldSource>
    fraudReasons: TaxonomyFieldSource
    reclassifyOptions: TaxonomyFieldSource
  }
}

/** The reviewer's in-progress edits to a row's decision fields, before
 * Submit writes them back. Starts seeded from the row's existing values
 * (blank Category/'' for an unreviewed row). */
export interface DecisionDraft {
  /** Document validity — independent from `status` below (a Valid
   * document can still be Rejected for other reasons, and vice versa;
   * neither is derived from the other). */
  category: CategoryValue | ''
  /** The Approve/Reject outcome. Only 2 real values exist in the sheet
   * (no "Incomplete" status — that's a Category value, not a Status
   * one). */
  status: StatusValue | ''
  rejectionReason: string
  fraudReason: string[]
  reclassified: string
  flags: string
}

export type ApiCalledFilter = 'all' | 'done' | 'not_done'

export interface QueueFilters {
  /** Master-sheet tab name, e.g. "03-09-2026". */
  date: string
  reviewer: string | 'All'
  status: StatusValue | 'All' | 'Pending'
  apiCalled: ApiCalledFilter
  /** Base document type (payslip/credit/loan/coe — see taxonomy.ts
   * `baseDocType`), not the exact "loan_0"/"loan_1" tab name — a
   * reviewer filtering by type means "show me payslips", not "show me
   * specifically the 2nd loan doc of a transaction". */
  documentType: string | 'All'
}
