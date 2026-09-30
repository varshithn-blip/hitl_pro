// Dev-only sanity check for ocrParser.ts's section-boundary heuristics,
// run against the fixture rows in lib/mockData.ts (which mirror the real
// OCR sheets' structure). Not a formal test suite — just a quick eyeball
// check that every fixture parses into the sections/fields you'd expect,
// since the ambiguity ocrParser.ts has to resolve (a section title vs. a
// blank-valued field both come back as one-cell rows) is exactly the kind
// of thing worth re-checking by hand against real sheet data once it's
// available. Run with `npm run verify:parser`.
import { evaluateExpression, formatComputed } from '../src/lib/calculator'
import { extractDriveFileId } from '../src/lib/driveApi'
import { attachFieldValidation, buildFieldEdits, forceTextIfDateOrNumeric, parseOcrRows } from '../src/lib/ocrParser'
import { parseMasterRow, parseRejectionReasonRefRows } from '../src/lib/masterSheet'
import { MOCK_OCR_DOCS } from '../src/lib/mockData'
import { computeDurationDays, computePayslipAutoFields, EMPTY_PAYSLIP_CALCULATOR } from '../src/lib/payslipCalc'
import { checkOutdatedDocument, daysSince, OUTDATED_DOCUMENT_REASON, parseDdMmYyyy } from '../src/lib/ruleChecks'
import type { GridCell } from '../src/lib/sheetsApi'
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
  const original = MOCK_OCR_DOCS['ETB-2029-4471::a1b7c9d0-1111-4a2b-9c3d-4e5f60718293::loan_0'].sections // keyed by masterRowKey (Transaction ID + Request ID + Document Type)
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

// Regression test for a real production bug: Image URL and Drive Link
// cells resolved to a null href (and so an unclickable "Open in Drive"
// button, and no document image ever loading) despite the cell clearly
// having a working link in Sheets' own UI. Root cause, found by pulling
// the real sheet's raw content directly: those two columns render as
// Sheets "Smart Chips" (a pill with an icon; the cell's visible text is
// just a short label like "File Link"/"Drive Link", never the URL) —
// and a smart chip's target lives in the API's `chipRuns` field, which
// `parseMasterRow`'s `link()` helper never read before. Sheet URL uses a
// classic hyperlink instead (its visible text IS the full URL, confirmed
// against the real sheet) — reproduced here too, to confirm the
// `hyperlink` path still wins over `chipRuns` when a cell has both.
console.log('\n=== parseMasterRow (smart-chip Image URL/Drive Link resolution) ===')
{
  const cells: GridCell[] = new Array(16).fill(null).map(() => ({}))
  // Image URL (index 3): smart chip, no `hyperlink` — exactly the shape
  // pulled from the real master sheet.
  cells[3] = { formattedValue: 'File Link', chipRuns: [{ chip: { richLinkProperties: { uri: 'https://drive.google.com/file/d/1AbCImageFileId/view?usp=drive_link' } } }] }
  // Sheet URL (index 5): classic hyperlink, visible text IS the URL, no chipRuns.
  cells[5] = {
    formattedValue: 'https://docs.google.com/spreadsheets/d/1JmQaoD3c_IkWG5YHlARvNsOUKpS1eUSHa7gu6Wa0fO8#gid=1618544619',
    hyperlink: 'https://docs.google.com/spreadsheets/d/1JmQaoD3c_IkWG5YHlARvNsOUKpS1eUSHa7gu6Wa0fO8#gid=1618544619',
  }
  // Drive Link (index 12): smart chip again, using the other common Drive URL shape (open?id=...).
  cells[12] = { formattedValue: 'Drive Link', chipRuns: [{ chip: { richLinkProperties: { uri: 'https://drive.google.com/open?id=1XyZDriveFileId' } } }] }

  const row = parseMasterRow(cells, 2)
  let fail = 0

  const ok1 = row.imageUrl.href === 'https://drive.google.com/file/d/1AbCImageFileId/view?usp=drive_link'
  if (!ok1) fail++
  console.log(`  ${ok1 ? 'ok  ' : 'FAIL'} Image URL (smart chip, no hyperlink) resolves via chipRuns - got ${JSON.stringify(row.imageUrl)}`)

  const ok2 = row.sheetUrl.href?.startsWith('https://docs.google.com/spreadsheets/') ?? false
  if (!ok2) fail++
  console.log(`  ${ok2 ? 'ok  ' : 'FAIL'} Sheet URL (classic hyperlink) still resolves via hyperlink, unaffected by the chip fallback - got ${JSON.stringify(row.sheetUrl)}`)

  const ok3 = row.driveLink.href === 'https://drive.google.com/open?id=1XyZDriveFileId'
  if (!ok3) fail++
  console.log(`  ${ok3 ? 'ok  ' : 'FAIL'} Drive Link (smart chip, no hyperlink) resolves via chipRuns - got ${JSON.stringify(row.driveLink)}`)

  // End-to-end: the resolved chip URL must also be a shape
  // extractDriveFileId (driveApi.ts) can actually pull a file id out of —
  // resolving the link is useless for the image preview otherwise.
  const imageFileId = extractDriveFileId(row.imageUrl.href)
  const ok4 = imageFileId === '1AbCImageFileId'
  if (!ok4) fail++
  console.log(`  ${ok4 ? 'ok  ' : 'FAIL'} extractDriveFileId reads the resolved Image URL chip link - got ${JSON.stringify(imageFileId)}`)

  const driveFileId = extractDriveFileId(row.driveLink.href)
  const ok5 = driveFileId === '1XyZDriveFileId'
  if (!ok5) fail++
  console.log(`  ${ok5 ? 'ok  ' : 'FAIL'} extractDriveFileId reads the resolved Drive Link chip link (open?id= shape) - got ${JSON.stringify(driveFileId)}`)

  if (fail > 0) {
    console.log(`\n${fail} parseMasterRow smart-chip case(s) failed.`)
    process.exitCode = 1
  }
}

// Sanity check for ruleChecks.ts's date parsing/comparison and the one
// automatic rule check this app currently has ("is this document
// outdated?", per explicit direction — payslip's Salary Period End Date,
// coe's Document Issued Date, both against a 60-day threshold). Uses a
// fixed `today` reference throughout so this doesn't depend on the
// actual date the suite happens to run on.
console.log('\n=== ruleChecks (parseDdMmYyyy / checkOutdatedDocument) ===')
{
  let fail = 0
  const ok = (cond: boolean, label: string) => {
    if (!cond) fail++
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`)
  }

  const d1 = parseDdMmYyyy('17/07/2026')
  ok(d1?.getUTCFullYear() === 2026 && d1?.getUTCMonth() === 6 && d1?.getUTCDate() === 17, 'parses "17/07/2026" as 17 July 2026 (dd/mm/yyyy, not mm/dd)')
  ok(parseDdMmYyyy("'17/07/2026") !== null, 'tolerates a leading force-text apostrophe (see forceTextIfDateOrNumeric)')
  ok(parseDdMmYyyy('31/02/2026') === null, "rejects a nonsense date (31 Feb) instead of letting it roll over into March")
  ok(parseDdMmYyyy('2026-07-17') === null, "rejects yyyy-mm-dd - not this app's convention")
  ok(parseDdMmYyyy('') === null, 'rejects a blank value')

  ok(daysSince(new Date(Date.UTC(2026, 6, 1)), new Date(Date.UTC(2026, 6, 31))) === 30, 'daysSince counts whole days correctly (1 Jul -> 31 Jul = 30)')

  const today = new Date(Date.UTC(2026, 8, 30)) // fixed "today" for every case below: 30 Sep 2026

  const outdatedPayslip: OcrSection[] = [{ kind: 'fields', title: '', fields: [{ label: 'Salary Period End Date', value: '17/07/2026', rowIndex: 1 }] }]
  const r1 = checkOutdatedDocument('payslip', outdatedPayslip, today)
  ok(r1.status === 'outdated' && r1.fieldLabel === 'Salary Period End Date', `payslip with a 75-day-old Salary Period End Date is flagged outdated - got ${JSON.stringify(r1)}`)
  if (r1.status === 'outdated') ok(r1.message.includes(OUTDATED_DOCUMENT_REASON), "the outdated result's message names the exact rejection reason it writes")

  const freshPayslip: OcrSection[] = [{ kind: 'fields', title: '', fields: [{ label: 'Salary Period End Date', value: '15/09/2026', rowIndex: 1 }] }]
  const r2 = checkOutdatedDocument('payslip', freshPayslip, today)
  ok(r2.status === 'ok', `payslip with a 15-day-old Salary Period End Date is NOT flagged - got ${JSON.stringify(r2)}`)

  const outdatedCoe: OcrSection[] = [{ kind: 'fields', title: '', fields: [{ label: 'Document Issued Date', value: '17/07/2026', rowIndex: 1 }] }]
  const r3 = checkOutdatedDocument('coe', outdatedCoe, today)
  ok(r3.status === 'outdated' && r3.fieldLabel === 'Document Issued Date', `coe with a 75-day-old Document Issued Date is flagged outdated - got ${JSON.stringify(r3)}`)

  const r4 = checkOutdatedDocument('loan', outdatedCoe, today)
  ok(r4.status === 'not-applicable', `loan has no outdated-document rule (yet) - got ${JSON.stringify(r4)}`)

  const noDateField: OcrSection[] = [{ kind: 'fields', title: '', fields: [{ label: 'Employee Name', value: 'Someone', rowIndex: 1 }] }]
  const r5 = checkOutdatedDocument('payslip', noDateField, today)
  ok(r5.status === 'unparseable', `payslip missing its Salary Period End Date field comes back unparseable, not a crash - got ${JSON.stringify(r5)}`)

  if (fail > 0) {
    console.log(`\n${fail} ruleChecks case(s) failed.`)
    process.exitCode = 1
  }
}

// Sanity check for lib/calculator.ts's safe arithmetic evaluator — the
// "type a sum, see the total" convenience behind the payslip calculator
// fields (Taxable/Non-Taxable Income, Deduction, SSS/PhilHealth Premium).
console.log('\n=== calculator (evaluateExpression / formatComputed) ===')
{
  let fail = 0
  const ok = (cond: boolean, label: string) => {
    if (!cond) fail++
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`)
  }

  ok(evaluateExpression('100+100') === 200, 'evaluates "100+100" -> 200 (the exact example from the spec)')
  ok(evaluateExpression('250000 - 12500') === 237500, 'evaluates a subtraction with spaces')
  ok(evaluateExpression('(80+20)*2') === 200, 'respects parentheses and operator precedence')
  ok(evaluateExpression('10/4') === 2.5, 'evaluates division')
  ok(evaluateExpression('-5+10') === 5, 'handles a leading unary minus')
  ok(evaluateExpression('  50 + 50  ') === 100, 'tolerates surrounding/internal whitespace')
  ok(evaluateExpression('') === null, 'blank expression -> null, not zero')
  ok(evaluateExpression('abc') === null, 'nonsense input -> null, not a crash')
  ok(evaluateExpression('10+') === null, 'incomplete expression -> null')
  ok(evaluateExpression('10/0') === null, 'division by zero -> null, not Infinity')
  ok(evaluateExpression('10 20') === null, 'trailing garbage after a valid number is rejected, not silently truncated')

  ok(formatComputed(200) === '200', 'formats a whole number without a trailing ".00"')
  ok(formatComputed(150.5) === '150.5', 'formats a simple decimal as-is')
  ok(formatComputed(41540.664999) === '41540.66', 'rounds to the nearest cent')

  if (fail > 0) {
    console.log(`\n${fail} calculator case(s) failed.`)
    process.exitCode = 1
  }
}

// Sanity check for lib/payslipCalc.ts — Duration from the two Salary
// Period dates, and Gross/Net Salary from the portal-only calculator,
// including the activation rules that keep an untouched calculator from
// ever overwriting a real OCR-extracted Gross/Net with a guessed zero.
console.log('\n=== payslipCalc (computeDurationDays / computePayslipAutoFields) ===')
{
  let fail = 0
  const ok = (cond: boolean, label: string) => {
    if (!cond) fail++
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`)
  }

  // Both cases below are taken straight from the real payslip_0/payslip_1
  // fixtures (mockData.ts), which is exactly how Duration's "+1, not a
  // plain difference" formula was originally confirmed.
  ok(computeDurationDays('01/08/2026', '15/08/2026') === 15, 'Duration for 01/08-15/08 is 15 (inclusive), matching the real payslip_0 fixture')
  ok(computeDurationDays('16/08/2026', '31/08/2026') === 16, 'Duration for 16/08-31/08 is 16, matching the real payslip_1 fixture')
  ok(computeDurationDays('15/08/2026', '01/08/2026') === null, 'an end date before the start date is never guessed at, just null')
  ok(computeDurationDays('not a date', '15/08/2026') === null, 'an unparseable date on either side is null, not a crash')

  const r1 = computePayslipAutoFields('01/08/2026', '15/08/2026', EMPTY_PAYSLIP_CALCULATOR)
  ok(r1.duration === '15', `dates alone compute Duration - got ${JSON.stringify(r1)}`)
  ok(r1.grossSalary === null && r1.netSalary === null, 'an untouched calculator never computes Gross/Net (no guessed zero)')
  ok(r1.sssPremium === null && r1.philHealthPremium === null, 'an untouched calculator never computes SSS/PhilHealth Premium either')

  const r2 = computePayslipAutoFields('01/08/2026', '15/08/2026', { ...EMPTY_PAYSLIP_CALCULATOR, taxableIncomeExpr: '30000' })
  ok(r2.grossSalary === '30000', `Taxable Income alone drives Gross Salary (Non-Taxable treated as 0) - got ${JSON.stringify(r2)}`)
  ok(r2.netSalary === '30000', 'Net Salary follows Gross once Gross is active (Deduction treated as 0)')

  const r3 = computePayslipAutoFields(null, null, {
    ...EMPTY_PAYSLIP_CALCULATOR,
    taxableIncomeExpr: '30000',
    nonTaxableIncomeExpr: '5000+1000',
    deductionExpr: '2500',
  })
  ok(r3.grossSalary === '36000', `Gross = Taxable + Non-Taxable (30000 + 6000) - got ${JSON.stringify(r3)}`)
  ok(r3.netSalary === '33500', 'Net = Gross - Deduction (36000 - 2500)')

  const r4 = computePayslipAutoFields(null, null, { ...EMPTY_PAYSLIP_CALCULATOR, deductionExpr: '2500' })
  ok(r4.grossSalary === null && r4.netSalary === null, 'Deduction alone (no Taxable/Non-Taxable touched) computes neither Gross nor Net - nothing to subtract it from')

  const r5 = computePayslipAutoFields(null, null, { ...EMPTY_PAYSLIP_CALCULATOR, sssExpr: '400+100', philHealthExpr: '250' })
  ok(r5.sssPremium === '500' && r5.philHealthPremium === '250', `SSS/PhilHealth Premium compute independently of Gross/Net - got ${JSON.stringify(r5)}`)

  if (fail > 0) {
    console.log(`\n${fail} payslipCalc case(s) failed.`)
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
