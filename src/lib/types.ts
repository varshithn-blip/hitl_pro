// Domain types for the review portal. Field names/semantics come directly
// from the master sheet + per-transaction OCR sheets — see
// /root/.claude/plans/we-have-a-team-fancy-whisper.md for the discovery
// notes this was built from.

export type CategoryValue = 'Valid' | 'Invalid' | 'Incomplete'
export type StatusValue = 'Manually Approved' | 'Manually Rejected'

/** A rendered link-chip cell (Image URL / Drive Link / Sheet URL). The
 * display text is always readable from the sheet; the real `href` requires
 * a live Sheets API read (hyperlink field / HYPERLINK() formula) — see
 * lib/sheetsApi.ts `resolveCellLink`. It's nullable because that
 * resolution is unverified until tested against the real API. */
export interface LinkCell {
  label: string
  href: string | null
}

/** One row of the master sheet = one document (one Request ID). */
export interface MasterRow {
  /** 1-based row number in the date tab, used to target writes. */
  rowIndex: number
  appId: string
  transactionId: string
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
  spreadsheetId: string
  tabTitle: string
  gid: number
  transactionId: string
  customerId: string
  error: string
  sections: OcrSection[]
}

export interface Taxonomy {
  category: CategoryValue[]
  /** Keyed by *base* document type (loan/payslip/credit/coe — the
   * Document Type value with any trailing "_<n>" stripped). */
  rejectionReasonsByDocType: Record<string, string[]>
  fraudReasons: string[]
  reclassifyOptions: string[]
  /** True once at least one list above came from the sheet's own data
   * validation rather than the hardcoded fallback. */
  source: 'sheet' | 'fallback'
}

/** The reviewer's in-progress edits to a row's decision fields, before
 * Submit writes them back. Starts seeded from the row's existing values
 * (blank Category/'' for an unreviewed row). */
export interface DecisionDraft {
  category: CategoryValue | ''
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
}
