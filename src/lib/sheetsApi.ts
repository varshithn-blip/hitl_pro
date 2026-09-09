// Thin wrapper around Google Sheets API v4, called directly from the
// browser with the signed-in reviewer's own OAuth access token — no
// backend, per the locked architecture decision (see plan notes). Every
// call here is UNVERIFIED against a real spreadsheet in this build pass
// (no live Google Cloud OAuth client was available while building this) —
// see README "Known gaps" before relying on it in production.

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export class SheetsApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function sheetsFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${SHEETS_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new SheetsApiError(body?.error?.message ?? `Sheets API request failed (${res.status})`, res.status)
  }
  return res.json()
}

/** 0-based column index -> A1 column letters (0 -> "A", 26 -> "AA"). */
export function columnLetter(index: number): string {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export interface SheetTab {
  sheetId: number
  title: string
  index: number
}

export async function listTabs(spreadsheetId: string, accessToken: string): Promise<SheetTab[]> {
  const data = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties(sheetId,title,index)`, accessToken)
  return (data.sheets ?? []).map((s: any) => s.properties as SheetTab)
}

/** Raw grid-data cell shape we care about — formatted display text, the
 * resolved hyperlink (if any), and any data-validation rule attached. */
export interface GridCell {
  formattedValue?: string
  hyperlink?: string
  dataValidation?: {
    condition?: { type: string; values?: { userEnteredValue?: string }[] }
  }
}

/** Fetch a sheet range with hyperlink + data-validation metadata, not just
 * plain values — needed to resolve the Image URL/Drive Link/Sheet URL link
 * chips, and to read dropdown option lists straight from the sheet. Plain
 * value reads (no metadata needed) should use `getValues` instead — it's
 * a much lighter request. */
export async function getGridData(spreadsheetId: string, a1Range: string, accessToken: string): Promise<GridCell[][]> {
  const fields = 'sheets(data(rowData(values(formattedValue,hyperlink,dataValidation))))'
  const data = await sheetsFetch(
    `/${spreadsheetId}?ranges=${encodeURIComponent(a1Range)}&fields=${encodeURIComponent(fields)}`,
    accessToken,
  )
  const rowData = data.sheets?.[0]?.data?.[0]?.rowData ?? []
  return rowData.map((row: any) => row.values ?? [])
}

export async function getValues(spreadsheetId: string, a1Range: string, accessToken: string): Promise<string[][]> {
  const data = await sheetsFetch(
    `/${spreadsheetId}/values/${encodeURIComponent(a1Range)}?valueRenderOption=FORMATTED_VALUE`,
    accessToken,
  )
  return data.values ?? []
}

export async function updateValues(spreadsheetId: string, a1Range: string, values: string[][], accessToken: string) {
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(a1Range)}?valueInputOption=USER_ENTERED`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ range: a1Range, majorDimension: 'ROWS', values }),
  })
}

export interface CellUpdate {
  range: string
  values: string[][]
}

/** Write several non-contiguous ranges (e.g. one row's worth of master-sheet
 * columns, or a handful of edited OCR field cells) in a single request, so
 * a submit is one round trip rather than N. */
export async function batchUpdateValues(spreadsheetId: string, updates: CellUpdate[], accessToken: string) {
  if (updates.length === 0) return
  await sheetsFetch(`/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates.map((u) => ({ range: u.range, majorDimension: 'ROWS', values: u.values })),
    }),
  })
}

/** Pull a dropdown's allowed values off a column's data-validation rule
 * (Sheets stores a ONE_OF_LIST condition with literal option strings).
 * Returns null when the column has no such rule so callers can fall back
 * to the hardcoded taxonomy instead of showing an empty dropdown. */
/** Parse the literal options for a `ONE_OF_LIST` validation rule (options
 * typed directly into the rule), or resolve the referenced range's own
 * cell values for a `ONE_OF_RANGE` rule (options pulled from a list
 * living elsewhere in the spreadsheet — a very common way to back a
 * large or shared dropdown, and the one this initially missed: it only
 * handled ONE_OF_LIST, so a range-backed dropdown silently fell back to
 * the hardcoded taxonomy every time). Returns null when the column has no
 * recognized dropdown rule, so callers can fall back rather than show an
 * empty dropdown. */
export async function extractValidationList(cells: GridCell[], spreadsheetId: string, accessToken: string): Promise<string[] | null> {
  for (const cell of cells) {
    const condition = cell.dataValidation?.condition
    if (!condition) continue

    if (condition.type === 'ONE_OF_LIST' && condition.values?.length) {
      const literal = condition.values.map((v) => v.userEnteredValue ?? '').filter(Boolean)
      if (literal.length > 0) return literal
    }

    if (condition.type === 'ONE_OF_RANGE' && condition.values?.[0]?.userEnteredValue) {
      const rangeRef = condition.values[0].userEnteredValue.replace(/^=/, '')
      try {
        const rangeValues = await getValues(spreadsheetId, rangeRef, accessToken)
        const flat = rangeValues.flat().map((v) => v?.trim()).filter(Boolean)
        if (flat.length > 0) return flat
      } catch {
        // The reference couldn't be resolved as-is — fall through so the
        // caller uses its fallback list instead of showing an empty one.
      }
    }
  }
  return null
}
