import { columnLetter, extractValidationList, getGridData, type CellUpdate, type GridCell } from './sheetsApi'
import type { LiveTaxonomyRead } from './taxonomy'
import { MASTER_COLUMNS, type CategoryValue, type MasterColumn, type MasterRow, type StatusValue } from './types'

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

/** Read the Category / Rejection Reason / Fraud Reason / Re-classified
 * columns' data-validation rules straight off the sheet, per the "read the
 * sheet's own dropdowns, hardcoded list is just a fallback" decision.
 * Checks the first few data rows (not just row 2) since a rule can in
 * theory be scoped to a sub-range rather than the whole column. */
export async function readLiveTaxonomy(spreadsheetId: string, tabTitle: string, accessToken: string): Promise<LiveTaxonomyRead> {
  const quotedTab = `'${tabTitle.replace(/'/g, "''")}'`
  const sampleRows = 6 // header + 5 data rows
  const grid = await getGridData(spreadsheetId, `${quotedTab}!A1:P${sampleRows}`, accessToken)
  const dataRows = grid.slice(1) // drop header

  const columnCells = (col: MasterColumn) => dataRows.map((row) => row[COLUMN_INDEX[col]]).filter(Boolean)

  const [category, rejectionReasonsFlat, fraudReasons, reclassifyOptions] = await Promise.all([
    extractValidationList(columnCells('Category'), spreadsheetId, accessToken),
    extractValidationList(columnCells('Rejection Reason'), spreadsheetId, accessToken),
    extractValidationList(columnCells('Fraud Reason'), spreadsheetId, accessToken),
    extractValidationList(columnCells('Re-classified'), spreadsheetId, accessToken),
  ])

  return { category, rejectionReasonsFlat, fraudReasons, reclassifyOptions }
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
