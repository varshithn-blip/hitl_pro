// Dev-only sanity check for ocrParser.ts's section-boundary heuristics,
// run against the fixture rows in lib/mockData.ts (which mirror the real
// OCR sheets' structure). Not a formal test suite — just a quick eyeball
// check that every fixture parses into the sections/fields you'd expect,
// since the ambiguity ocrParser.ts has to resolve (a section title vs. a
// blank-valued field both come back as one-cell rows) is exactly the kind
// of thing worth re-checking by hand against real sheet data once it's
// available. Run with `npm run verify:parser`.
import { attachFieldValidation, buildFieldEdits, forceTextIfDateOrNumeric, parseOcrRows } from '../src/lib/ocrParser'
import { parseRejectionReasonRefRows } from '../src/lib/masterSheet'
import { MOCK_OCR_DOCS } from '../src/lib/mockData'
import type { OcrSection } from '../src/lib/types'

// Sanity check for forceTextIfDateOrNumeric against real values pulled
// from the actual sheets during discovery (dates, amounts) vs. real
// non-date/non-number field values that must NOT get a ' prefix.
const FORCE_TEXT_CASES: [value: string, shouldForce: boolean][] = [
  ['17/07/2026', true],
  ['31/08/2026', true],
  ['02/08/2024', true],
  ['2026-07-17', true],
  ['250000', true],
  ['9125.50', true],
  ['9,888.20', true],
  ['-850', true],
  ['1.75', true],
  ['', false],
  ['Monthly', false],
  ['PHP', false],
  ['Present', false],
  ['IT Network Administrator', false],
  ['San Carlos Sun Power Inc | Cat B | 1', false],
  ["'17/07/2026", false], // already forced - don't double-prefix
]
console.log('\n=== forceTextIfDateOrNumeric ===')
let forceTextFailures = 0
for (const [value, shouldForce] of FORCE_TEXT_CASES) {
  const result = forceTextIfDateOrNumeric(value)
  const forced = result.startsWith("'") && result !== value
  const ok = forced === shouldForce
  if (!ok) forceTextFailures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} "${value}" -> "${result}" (expected force=${shouldForce}, got=${forced})`)
}
if (forceTextFailures > 0) {
  console.log(`\n${forceTextFailures} forceTextIfDateOrNumeric case(s) failed.`)
  process.exitCode = 1
}

// Regression test for a real production bug: a field whose OCR value came
// back blank (a 1-cell row, indistinguishable in shape from a section
// title) sitting right before an ORDINARY text field (also a plain
// "label, value" row, same shape as a table header) used to get misread
// as "this blank field is a section title, and the field after it is a
// table header" — silently eating both real fields (one becomes an
// uneditable table column header, the other becomes trapped as a cell in
// a bogus "row") and surfacing as a garbled table with an Add row button
// and random-looking column names. Reproduces the exact shape that
// triggered it: Employee Designation (blank) directly followed by
// Status of Employment / Currency, two more plain text fields.
console.log('\n=== parseOcrRows (blank-field-before-ordinary-field regression) ===')
{
  const rows = [
    ['HyperVergeTransaction ID', 'ETB-TEST-0001'],
    ['Customer ID', 'rgitid'],
    ['Error', ''],
    ['Fields', 'Values'],
    ['Employee Name', 'Julian Paolo E. Caraballe'],
    ['Employee Designation'], // blank OCR value - the false-positive trigger
    ['Status of Employment', 'Present'], // ordinary text field - used to be misread as a table header
    ['Currency', 'PHP'], // ordinary text field - used to be misread as a table row
  ]
  const doc = parseOcrRows(rows)
  let fail = 0

  const ok1 = doc.sections.length === 1 && doc.sections[0].kind === 'fields'
  if (!ok1) fail++
  console.log(`  ${ok1 ? 'ok  ' : 'FAIL'} exactly one fields section (no bogus table section created) - got ${doc.sections.length} section(s): ${doc.sections.map((s) => `${s.kind}:"${s.title}"`).join(', ')}`)

  if (doc.sections[0]?.kind === 'fields') {
    const labels = doc.sections[0].fields.map((f) => f.label)
    const expected = ['Employee Name', 'Employee Designation', 'Status of Employment', 'Currency']
    const ok2 = JSON.stringify(labels) === JSON.stringify(expected)
    if (!ok2) fail++
    console.log(`  ${ok2 ? 'ok  ' : 'FAIL'} all 4 fields present and editable, in order - got [${labels.join(', ')}]`)

    const designation = doc.sections[0].fields.find((f) => f.label === 'Employee Designation')
    const ok3 = designation?.value === ''
    if (!ok3) fail++
    console.log(`  ${ok3 ? 'ok  ' : 'FAIL'} "Employee Designation" kept as a field with its real (blank) value - got ${JSON.stringify(designation)}`)
  } else {
    fail++
  }

  if (fail > 0) {
    console.log(`\n${fail} parseOcrRows regression case(s) failed.`)
    process.exitCode = 1
  }
}

// Sanity check for buildFieldEdits: a reviewer edits exactly one
// plain-text field on a real fixture (loan_0, which has a good mix of
// dates, amounts, and text) and leaves everything else untouched. Expect:
// every date/numeric field to be included (protected) even though
// untouched, the one edited text field to be included, and every other
// untouched text field to be excluded.
console.log('\n=== buildFieldEdits (edit-one-field-only scenario) ===')
{
  const original = MOCK_OCR_DOCS['ETB-2029-4471::loan_0'].sections
  const draft = structuredClone(original) as OcrSection[]
  const fieldsSection = draft.find((s) => s.kind === 'fields' && s.title === 'Loan Details')
  if (fieldsSection?.kind === 'fields') {
    const loanType = fieldsSection.fields.find((f) => f.label === 'Loan Type')
    if (loanType) loanType.value = 'Auto Loan' // the one deliberate edit
  }

  const edits = buildFieldEdits(original, draft)
  const editedLabels = new Set(
    edits.map((e) => {
      for (const section of original) {
        if (section.kind === 'fields') {
          const f = section.fields.find((f) => f.rowIndex === e.fieldRowIndex)
          if (f) return f.label
        }
      }
      return `row${e.fieldRowIndex}`
    }),
  )

  const expectIncluded = ['Loan Type', 'Statement Date', 'Statement Month', 'Statement Year', 'Avail Date', 'Total Loan Amount', 'EMI Amount', 'Outstanding Balance']
  let fail = 0
  for (const label of expectIncluded) {
    const ok = editedLabels.has(label)
    if (!ok) fail++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} "${label}" included (protected/edited) - expected yes, got ${ok}`)
  }
  for (const label of ['Customer Name', 'Customer Address', 'Bank Name']) {
    const ok = !editedLabels.has(label)
    if (!ok) fail++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} "${label}" excluded (untouched, non-date/number) - expected yes, got ${ok}`)
  }
  console.log(`  (for reference, all fields written this submit: ${[...editedLabels].join(', ')})`)
  if (fail > 0) {
    console.log(`\n${fail} buildFieldEdits case(s) failed.`)
    process.exitCode = 1
  }
}

// Sanity check for parseRejectionReasonRefRows against the real content of
// the master spreadsheet's own "Ref" tab (fetched directly via the Drive
// API during this build pass) — including the row-truncation shape
// Sheets' values.get actually returns: trailing blank cells are dropped
// per row, but a leading blank followed by a later non-blank cell in that
// same row is kept (see the last row below, which has nothing in the
// payslip column).
console.log('\n=== parseRejectionReasonRefRows (real "Ref" tab content) ===')
{
  const refRows: string[][] = [
    ['Rejection Reason - payslip', 'Rejection Reason - credit', 'Rejection Reason - coe', 'Rejection Reason - loan'],
    ['Irrelevant Documents/Images', 'Irrelevant Documents/Images', 'Irrelevant Documents/Images', 'Irrelevant Documents/Images'],
    ['Unreadable Document', 'Unreadable Document', 'Unreadable Document', 'Unreadable Document'],
    ['Cropped/Partial Document', 'Cropped/Partial Document', 'Cropped/Partial Document', 'Cropped/Partial Document'],
    ['Outdated Document', 'Outdated Document', 'Outdated Document', 'Outdated Document'],
    ['Future Date', 'Future Date', 'Future Date', 'Future Date'],
    ['Password locked / Access Denied', 'Password locked / Access Denied', 'Password locked / Access Denied', 'Password locked / Access Denied'],
    ['Missing Issue Date', 'Bank Name is Missing', 'Employee Name Missing', 'Bank / Lender Name Missing'],
    ['Employee Name Missing', 'Statement Date Missing', 'Employer Name Missing', 'Loan Statement is Missing'],
    ['Employer Name Missing', 'Total Amount Due Missing', 'Total Salary Amount Missing', 'Loan Amount Missing'],
    ['Gross Salary Missing', 'Outstanding Balance Missing', 'Total Salary Frequency Missing', 'Interest Rate Missing'],
    ['Net Salary Missing', 'Due Date Missing', 'Missing Issue Date', 'Loan Tenor Missing'],
    ['Duration <= 0', 'Customer Name Missing', 'Salary = 0', 'EMI Amount Missing'],
    ['Duration >= 367', 'Customer Address Missing', 'Missing Salary', 'Outstanding Balance Missing'],
    ['Duration Missing', 'Credit Limit Value < 0', 'Employment start date missing'],
    ['Gross Pay / Net Pay < 0', 'Credit Limit Value Missing'],
    ['Basic/Regular Pay Missing', 'Transaction History Missing'],
    ['', 'Account Number Missing'],
  ]

  const result = parseRejectionReasonRefRows(refRows)
  let fail = 0

  const expectCounts: Record<string, number> = { payslip: 16, credit: 17, coe: 14, loan: 13 }
  for (const [docType, expected] of Object.entries(expectCounts)) {
    const actual = result?.[docType]?.length ?? 0
    const ok = actual === expected
    if (!ok) fail++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} "${docType}" -> ${actual} reasons (expected ${expected})`)
  }

  // The exact bug this guards against: one doc type's list leaking into
  // another's (e.g. loan's "EMI Amount Missing" showing up for payslip).
  const leakChecks: [docType: string, mustNotContain: string][] = [
    ['payslip', 'EMI Amount Missing'], // loan-only
    ['payslip', 'Credit Limit Value Missing'], // credit-only
    ['loan', 'Net Salary Missing'], // payslip-only
    ['coe', 'Account Number Missing'], // credit-only
  ]
  for (const [docType, mustNotContain] of leakChecks) {
    const leaked = result?.[docType]?.includes(mustNotContain) ?? false
    const ok = !leaked
    if (!ok) fail++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} "${docType}" does not contain "${mustNotContain}" (cross-doc-type leak check)`)
  }

  // The last row's blank payslip cell must not show up as an empty-string
  // "reason" (the Sheets row-truncation edge case).
  const payslipHasBlank = result?.payslip?.includes('') ?? false
  const blankOk = !payslipHasBlank
  if (!blankOk) fail++
  console.log(`  ${blankOk ? 'ok  ' : 'FAIL'} "payslip" has no blank-string entries (row-truncation edge case)`)

  if (fail > 0) {
    console.log(`\n${fail} parseRejectionReasonRefRows case(s) failed.`)
    process.exitCode = 1
  }
}

// Sanity check for attachFieldValidation: a field whose value cell (column
// B) carries a ONE_OF_LIST data-validation rule (Company Category, in
// practice) gets that rule's options attached; an ordinary field with no
// rule on its cell is untouched (null, not an empty array — so the UI can
// tell "checked, nothing there" apart from "not checked yet"). Uses
// ONE_OF_LIST specifically because it needs no network call to resolve,
// unlike ONE_OF_RANGE (see extractValidationList in sheetsApi.ts) — this
// stays a same offline check like the rest of this script.
console.log("\n=== attachFieldValidation (Company-Category-style live suggestions) ===")
await (async () => {
  const sections: OcrSection[] = [
    {
      kind: 'fields',
      title: '',
      fields: [
        { label: 'Employer Name', value: 'San Carlos Sun Power Inc', rowIndex: 7 },
        { label: 'Company Category', value: 'San Carlos Sun Power Inc | Cat B | 1', rowIndex: 8 },
      ],
    },
  ]
  const grid = [
    [], // row 1
    [], // row 2
    [], // row 3
    [], // row 4
    [], // row 5
    [], // row 6
    [{ formattedValue: 'Employer Name' }, { formattedValue: 'San Carlos Sun Power Inc' }], // row 7 - no rule
    [
      { formattedValue: 'Company Category' },
      {
        formattedValue: 'San Carlos Sun Power Inc | Cat B | 1',
        dataValidation: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Cat A' }, { userEnteredValue: 'Cat B' }, { userEnteredValue: 'No Match' }] } },
      },
    ], // row 8 - has a rule
  ]

  const result = await attachFieldValidation(sections, grid as any, 'fake-spreadsheet-id', 'fake-token')
  const fields = result[0].kind === 'fields' ? result[0].fields : []
  let fail = 0

  const employer = fields.find((f) => f.label === 'Employer Name')
  const ok1 = employer?.validationOptions == null
  if (!ok1) fail++
  console.log(`  ${ok1 ? 'ok  ' : 'FAIL'} "Employer Name" (no rule on its cell) has no options - got ${JSON.stringify(employer?.validationOptions)}`)

  const category = fields.find((f) => f.label === 'Company Category')
  const ok2 = JSON.stringify(category?.validationOptions) === JSON.stringify(['Cat A', 'Cat B', 'No Match'])
  if (!ok2) fail++
  console.log(`  ${ok2 ? 'ok  ' : 'FAIL'} "Company Category" gets its cell's live options - got ${JSON.stringify(category?.validationOptions)}`)

  const ok3 = category?.value === 'San Carlos Sun Power Inc | Cat B | 1'
  if (!ok3) fail++
  console.log(`  ${ok3 ? 'ok  ' : 'FAIL'} "Company Category" keeps its real OCR value even though it doesn't match any option - got "${category?.value}"`)

  if (fail > 0) {
    console.log(`\n${fail} attachFieldValidation case(s) failed.`)
    process.exitCode = 1
  }
})()

for (const [key, doc] of Object.entries(MOCK_OCR_DOCS)) {
  console.log(`\n=== ${key} (txn=${doc.transactionId}, tab=${doc.tabTitle}) ===`)
  for (const section of doc.sections) {
    if (section.kind === 'fields') {
      console.log(`  [fields] "${section.title}" - ${section.fields.length} fields`)
      for (const f of section.fields) {
        console.log(
          `      row${f.rowIndex}: ${f.label} = "${f.value}"${f.remark ? ` (remark: ${f.remark})` : ''}${f.validationOptions?.length ? ` (sheet options: ${f.validationOptions.join(', ')})` : ''}`,
        )
      }
    } else {
      console.log(`  [table]  "${section.title}" - columns: ${section.columns.join(' | ')}`)
      for (const r of section.rows) {
        console.log(`      row${r.rowIndex}: ${r.cells.join(' | ')}`)
      }
    }
  }
}
