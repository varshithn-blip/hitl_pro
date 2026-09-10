import { columnLetter, extractValidationList, getGridData, getValues, type CellUpdate, type GridCell, type SheetTab } from './sheetsApi'
import type { LiveTaxonomyRead } from './taxonomy'
import { MASTER_COLUMNS, type CategoryValue, type MasterColumn, type MasterRow, type StatusValue } from './types'

/** Matches the master sheet's date-tab naming convention ("03-09-2026").
 * Used to keep tabs added for other purposes (the "Ref" rejection-reason
 * lookup, the "Reviewers" notes tab, ...) out of the Date filter and out
 * of the "most recent tab" pick that seeds it — a non-date tab living in
 * the same spreadsheet must never be mistaken for a day's queue. */
const DATE_TAB_PATTERN = /^\d{2}-\d{2}-\d{4}$/

export function isDateTabTitle(title: string): boolean {
  return DATE_TAB_PATTERN.test(title.trim())
}

const COLUMN_INDEX: Record<MasterColumn, number> = Object.fromEntries(
  MASTER_COLUMNS.map((c, i) => [c, i]),
) as Record<MasterColumn, number>

/** Google Sheets stores a multi-select cell (Fraud Reason) as a single
 * delimited string. Comma is the Sheets UI's own convention for a
 * checkbox-backed multi-value cell — kept configurable here in one place
 * in case the live sheet turns out to use a different separator. */
const FRAUD_REASON_DELIMITER = ', '

function splitFraudReasons(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function joinFraudReasons(reasons: string[]): string {
  return reasons.join(FRAUD_REASON_DELIMITER)
}

const SHEET_URL_PATTERN = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+).*?[?&#]gid=(\d+)/

export function parseSheetUrlHref(href: string | null): { spreadsheetId: string; gid: number } | null {
  if (!href) return null
  const match = href.match(SHEET_URL_PATTERN)
  if (!match) return null
  return { spreadsheetId: match[1], gid: Number(match[2]) }
}

/** Turn one row of grid data (as returned by sheetsApi.getGridData, header
 * row NOT included) into a typed MasterRow. `sheetRowNumber` is the
 * 1-based row number in the actual tab (header = row 1, so the first data
 * row is 2) — kept explicit rather than inferred so callers can't get it
 * off-by-one when slicing. */
export function parseMasterRow(cells: GridCell[], sheetRowNumber: number): MasterRow {
  const cell = (col: MasterColumn) => cells[COLUMN_INDEX[col]]
  const text = (col: MasterColumn) => cell(col)?.formattedValue ?? ''
  const link = (col: MasterColumn) => ({ label: text(col), href: cell(col)?.hyperlink ?? null })

  return {
    rowIndex: sheetRowNumber,
    appId: text('App ID'),
    transactionId: text('Transaction ID'),
    requestId: text('Request ID'),
    imageUrl: link('Image URL'),
    documentType: text('Document Type'),
    sheetUrl: link('Sheet URL'),
    category: text('Category') as CategoryValue | '',
    rejectionReason: text('Rejection Reason'),
    status: text('Status') as StatusValue | '',
    fraudReason: splitFraudReasons(text('Fraud Reason')),
    reviewer: text('Reviewer'),
    apiCalled: text('API Called'),
    driveLink: link('Drive Link'),
    flags: text('Flags'),
    reclassified: text('Re-classified'),
    processed: text('Processed'),
  }
}

export function parseMasterRows(grid: GridCell[][]): MasterRow[] {
  // grid[0] is the header row; data starts at grid[1] = sheet row 2.
  return grid.slice(1).map((cells, i) => parseMasterRow(cells, i + 2))
}

/** The columns a reviewer actually writes back on submit. Image URL, Sheet
 * URL, Drive Link, App/Transaction/Request ID, Reviewer, API Called and
 * Processed are all left untouched by the portal — see plan notes. */
const REVIEWER_EDITABLE_COLUMNS: MasterColumn[] = ['Category', 'Rejection Reason', 'Status', 'Fraud Reason', 'Re-classified', 'Flags']

/** Pure parsing half of the "Ref" tab read (see `readRejectionReasonRefSheet`
 * below) — kept separate from the network fetch so it can be sanity-checked
 * against real fixture rows in scripts/verify-parser.ts without a live API
 * call. Column order and count aren't assumed: each header cell is parsed
 * for its trailing "- <type>" to find which document type it belongs to,
 * so reordering or adding a column on the Ref tab doesn't need a code
 * change — only the header text needs to keep ending in "- <type>". */
export function parseRejectionReasonRefRows(rows: string[][]): Record<string, string[]> | null {
  const [header, ...dataRows] = rows
  if (!header) return null

  const byDocType: Record<string, string[]> = {}
  header.forEach((headerCell, colIndex) => {
    const match = headerCell?.match(/-\s*([a-zA-Z]+)\s*$/)
    if (!match) return // header doesn't look like "Rejection Reason - <type>" — skip rather than guess
    const docType = match[1].trim().toLowerCase()
    const values = dataRows.map((row) => row[colIndex]?.trim()).filter((v): v is string => Boolean(v))
    if (values.length > 0) byDocType[docType] = values
  })

  return Object.keys(byDocType).length > 0 ? byDocType : null
}

/** The master sheet's own Rejection Reason column is shared across every
 * row regardless of document type, so its data-validation rule (if any) is
 * necessarily one flat list — it structurally can't vary by document type.
 * The real payslip/credit/coe/loan breakdown lives in a dedicated "Ref"
 * tab maintained by hand in the same spreadsheet: one column per document
 * type, headed "Rejection Reason - <type>". Read that instead of the
 * column's own validation rule for this one field. */
async function readRejectionReasonRefSheet(spreadsheetId: string, tabs: SheetTab[], accessToken: string): Promise<Record<string, string[]> | null> {
  const refTab = tabs.find((t) => t.title.trim().toLowerCase() === 'ref')
  if (!refTab) return null

  const quotedTab = `'${refTab.title.replace(/'/g, "''")}'`
  try {
    const rows = await getValues(spreadsheetId, `${quotedTab}!A1:Z500`, accessToken)
    return parseRejectionReasonRefRows(rows)
  } catch {
    return null
  }
}

/** Read the Category / Fraud Reason / Re-classified columns' data-
 * validation rules straight off the sheet, per the "read the sheet's own
 * dropdowns, hardcoded list is just a fallback" decision, plus the
 * per-doc-type Rejection Reason lists from the "Ref" tab (see above).
 * Checks the first few data rows (not just row 2) since a rule can in
 * theory be scoped to a sub-range rather than the whole column. */
export async function readLiveTaxonomy(spreadsheetId: string, tabTitle: string, tabs: SheetTab[], accessToken: string): Promise<LiveTaxonomyRead> {
  const quotedTab = `'${tabTitle.replace(/'/g, "''")}'`
  const sampleRows = 26 // header + 25 data rows — a little deep on purpose, so an early run of rows that happen to be all-blank on a given column doesn't look like "no rule" when there is one
  const grid = await getGridData(spreadsheetId, `${quotedTab}!A1:P${sampleRows}`, accessToken)
  const dataRows = grid.slice(1) // drop header

  const columnCells = (col: MasterColumn) => dataRows.map((row) => row[COLUMN_INDEX[col]]).filter(Boolean)

  const [category, fraudReasons, reclassifyOptions, rejectionReasonsByDocType] = await Promise.all([
    extractValidationList(columnCells('Category'), spreadsheetId, accessToken),
    extractValidationList(columnCells('Fraud Reason'), spreadsheetId, accessToken),
    extractValidationList(columnCells('Re-classified'), spreadsheetId, accessToken),
    readRejectionReasonRefSheet(spreadsheetId, tabs, accessToken),
  ])

  return { category, fraudReasons, reclassifyOptions, rejectionReasonsByDocType }
}

export interface MasterRowDecision {
  category: CategoryValue
  rejectionReason: string
  status: StatusValue
  fraudReason: string[]
  reclassified: string
  flags: string
}

/** Build the batched cell writes for one reviewer decision. One range per
 * changed column rather than a single contiguous row write, since the
 * columns being touched (G-N-ish) aren't contiguous with the ones we never
 * touch (D, F, K, L, M, P). */
export function buildDecisionUpdates(tabTitle: string, rowIndex: number, decision: MasterRowDecision): CellUpdate[] {
  const values: Record<MasterColumn, string> = {
    Category: decision.category,
    'Rejection Reason': decision.category === 'Valid' ? '' : decision.rejectionReason,
    Status: decision.status,
    'Fraud Reason': joinFraudReasons(decision.fraudReason),
    'Re-classified': decision.reclassified,
    Flags: decision.flags,
  } as Record<MasterColumn, string>

  const quotedTab = `'${tabTitle.replace(/'/g, "''")}'`
  return REVIEWER_EDITABLE_COLUMNS.map((col) => {
    const colLetter = columnLetter(COLUMN_INDEX[col])
    return {
      range: `${quotedTab}!${colLetter}${rowIndex}`,
      values: [[values[col]]],
    }
  })
}
