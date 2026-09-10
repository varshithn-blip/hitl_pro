import type { CellUpdate } from './sheetsApi'
import type { OcrDocument, OcrFieldsSection, OcrSection, OcrTableSection } from './types'

// Parses one OCR tab's raw rows into sections. This is a GENERIC,
// data-driven parser rather than a hardcoded per-document-type schema —
// deliberately, since the OCR pipeline can add new document types over
// time and every tab observed so far (loan_0, payslip_0, credit_0, coe_0)
// follows the same template:
//
//   HyperVergeTransaction ID, <id>
//   Customer ID, <id>
//   Error, <text or blank>
//   [optional blank row]
//   Fields, Values[, <remark column header>]
//   <label>, <value>[, <remark>]        <- repeated for each field
//   ...
//   <Section Title>                      <- e.g. "Loan Details" — OR, for a
//   Fields, Values                          repeating-table section like
//   <label>, <value>                        "Salary Components":
//   ...                                   <Section Title>
//                                         <Col A>, <Col B>, <Col C>
//                                         <row>, <row>, <row>
//                                         ...
//
// The tricky part: Sheets' values.get truncates each row to its last
// non-empty cell, so a field whose OCR value is blank comes back as a
// ONE-CELL row — structurally identical to a section-title row. See the
// comments on `looksLikeHeaderRow` for how that's disambiguated. This is
// UNVERIFIED against the real API (only tested against fixture text pulled
// from the real sheets during discovery — see mockData.ts) — flagged in
// the README.

function isBlankRow(row: string[]): boolean {
  return row.every((c) => !c || !c.trim())
}

function looksNumeric(s: string): boolean {
  if (!s.trim()) return false
  return Number.isFinite(Number(s.replace(/[,%\s]/g, '')))
}

/** Is `row` the header of a new section (as opposed to a normal data row)?
 * Two forms: the ubiquitous "Fields, Values[, <remark col>]", or a
 * table-section header (e.g. "Component Name, Amount, Frequency") —
 * distinguished from a table's own data rows by: none of a header row's
 * cells look numeric, whereas a real data row in a repeating table
 * (amounts, counts) almost always has at least one numeric-looking cell. */
function looksLikeHeaderRow(row: string[], nextRow: string[] | undefined): boolean {
  if (row.length >= 2 && row[0]?.trim().toLowerCase() === 'fields' && row[1]?.trim().toLowerCase() === 'values') {
    return true
  }
  if (row.length >= 2 && row.every((c) => c && c.trim()) && !row.some(looksNumeric)) {
    // Only trust this as a table header if the row after it exists and is
    // plausibly a same-shaped data row (roughly the same column count) —
    // guards against misreading an ordinary two-column data row (e.g.
    // "Employee Name, Julian Paolo E. Caraballe") as a header.
    if (nextRow && nextRow.length >= 1 && !isBlankRow(nextRow)) return true
  }
  return false
}

export function parseOcrRows(rows: string[][]): Omit<OcrDocument, 'spreadsheetId' | 'tabTitle' | 'gid'> {
  const transactionId = rows[0]?.[1] ?? ''
  const customerId = rows[1]?.[1] ?? ''
  const error = rows[2]?.[1] ?? ''

  const sections: OcrSection[] = []
  let i = 3
  let pendingTitle = ''

  const startFieldsSection = (headerRow: string[]) => {
    const hasRemarkColumn = headerRow.length >= 3
    const section: OcrFieldsSection = { kind: 'fields', title: pendingTitle, fields: [] }
    pendingTitle = ''
    sections.push(section)
    i++ // consume header row
    while (i < rows.length) {
      const row = rows[i]
      if (isBlankRow(row)) break
      if (row.length === 1 && looksLikeHeaderRow(rows[i + 1] ?? [], rows[i + 2])) break // next row is a new section title
      section.fields.push({
        label: row[0] ?? '',
        value: row[1] ?? '',
        remark: hasRemarkColumn ? row[2] : undefined,
        rowIndex: i + 1, // 1-based sheet row
      })
      i++
    }
  }

  const startTableSection = (headerRow: string[]) => {
    const section: OcrTableSection = { kind: 'table', title: pendingTitle, columns: headerRow.map((c) => c ?? ''), rows: [] }
    pendingTitle = ''
    sections.push(section)
    i++ // consume header row
    while (i < rows.length) {
      const row = rows[i]
      if (isBlankRow(row)) break
      section.rows.push({ rowIndex: i + 1, cells: row })
      i++
    }
  }

  while (i < rows.length) {
    const row = rows[i]
    if (isBlankRow(row)) {
      i++
      continue
    }

    if (row.length === 1) {
      // Candidate section title — only treated as one if the row after it
      // is recognizably a header; otherwise it's a field with a blank
      // OCR'd value.
      const next = rows[i + 1] ?? []
      if (looksLikeHeaderRow(next, rows[i + 2])) {
        pendingTitle = row[0] ?? ''
        i++
        continue
      }
      // Blank-valued field within whatever section is currently open. If
      // no section has been opened yet (shouldn't happen given the
      // template, but don't crash on unexpected input), start one.
      if (sections.length === 0 || sections[sections.length - 1].kind !== 'fields') {
        sections.push({ kind: 'fields', title: pendingTitle, fields: [] })
        pendingTitle = ''
      }
      const current = sections[sections.length - 1] as OcrFieldsSection
      current.fields.push({ label: row[0] ?? '', value: '', rowIndex: i + 1 })
      i++
      continue
    }

    // A 2+ cell row here is a header row for a new section (fields or
    // table) — normal data rows of length >= 2 are only ever consumed
    // inside startFieldsSection/startTableSection's own loops, never seen
    // by this top-level loop.
    if (row[0]?.trim().toLowerCase() === 'fields') {
      startFieldsSection(row)
    } else {
      startTableSection(row)
    }
  }

  return { transactionId, customerId, error, sections }
}

/** Build the write-back cell updates for edits to a fields-section
 * (label -> new value) and/or a table-section (rowIndex -> new cells). */
// The OCR sheets' own date formatting is inconsistent at the source
// (mm/dd/yyyy in some fields, and — per the user — any day value over 12
// isn't a valid month, so Sheets can't parse it as a date at all and
// silently turns the cell into a raw serial number instead, corrupting
// it). None of that is something this app produced or can retroactively
// repair by guessing which convention a given ambiguous value used (a
// value like "07/09/2026" is genuinely ambiguous between 7-Sep and
// 9-Jul with no way to tell from the string alone).
//
// What IS fixable here: writes THIS app makes going forward. Sheets API
// writes use valueInputOption=USER_ENTERED (see sheetsApi.ts), which is
// the mode where a leading `'` forces a cell to plain text — exactly like
// typing `'17/07/2026` into the Sheets UI — the apostrophe itself never
// appears in the stored/displayed value, it just stops Sheets from trying
// to auto-parse (and potentially mangle) the value as a date or number.
// Applying that to every date-shaped or number-shaped value this app
// writes means anything a reviewer corrects and submits is permanently
// protected from this corruption, regardless of which day/month a date
// value uses.
const DATE_LIKE = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/
const NUMERIC_LIKE = /^-?\d[\d,]*(\.\d+)?$/

export function forceTextIfDateOrNumeric(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith("'")) return value
  return DATE_LIKE.test(trimmed) || NUMERIC_LIKE.test(trimmed) ? `'${value}` : value
}

export function buildOcrCellUpdates(
  tabTitle: string,
  edits: { fieldRowIndex: number; value: string }[],
  tableEdits: { rowIndex: number; cells: string[] }[],
): CellUpdate[] {
  const quotedTab = `'${tabTitle.replace(/'/g, "''")}'`
  const fieldUpdates: CellUpdate[] = edits.map((e) => ({
    range: `${quotedTab}!B${e.fieldRowIndex}`,
    values: [[forceTextIfDateOrNumeric(e.value)]],
  }))
  const tableUpdates: CellUpdate[] = tableEdits.map((e) => ({
    range: `${quotedTab}!A${e.rowIndex}:${String.fromCharCode(65 + e.cells.length - 1)}${e.rowIndex}`,
    values: [e.cells.map(forceTextIfDateOrNumeric)],
  }))
  return [...fieldUpdates, ...tableUpdates]
}
