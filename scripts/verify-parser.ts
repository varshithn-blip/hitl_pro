// Dev-only sanity check for ocrParser.ts's section-boundary heuristics,
// run against the fixture rows in lib/mockData.ts (which mirror the real
// OCR sheets' structure). Not a formal test suite — just a quick eyeball
// check that every fixture parses into the sections/fields you'd expect,
// since the ambiguity ocrParser.ts has to resolve (a section title vs. a
// blank-valued field both come back as one-cell rows) is exactly the kind
// of thing worth re-checking by hand against real sheet data once it's
// available. Run with `npm run verify:parser`.
import { forceTextIfDateOrNumeric } from '../src/lib/ocrParser'
import { MOCK_OCR_DOCS } from '../src/lib/mockData'

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

for (const [key, doc] of Object.entries(MOCK_OCR_DOCS)) {
  console.log(`\n=== ${key} (txn=${doc.transactionId}, tab=${doc.tabTitle}) ===`)
  for (const section of doc.sections) {
    if (section.kind === 'fields') {
      console.log(`  [fields] "${section.title}" - ${section.fields.length} fields`)
      for (const f of section.fields) {
        console.log(`      row${f.rowIndex}: ${f.label} = "${f.value}"${f.remark ? ` (remark: ${f.remark})` : ''}`)
      }
    } else {
      console.log(`  [table]  "${section.title}" - columns: ${section.columns.join(' | ')}`)
      for (const r of section.rows) {
        console.log(`      row${r.rowIndex}: ${r.cells.join(' | ')}`)
      }
    }
  }
}
