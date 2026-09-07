// Dev-only sanity check for ocrParser.ts's section-boundary heuristics,
// run against the fixture rows in lib/mockData.ts (which mirror the real
// OCR sheets' structure). Not a formal test suite — just a quick eyeball
// check that every fixture parses into the sections/fields you'd expect,
// since the ambiguity ocrParser.ts has to resolve (a section title vs. a
// blank-valued field both come back as one-cell rows) is exactly the kind
// of thing worth re-checking by hand against real sheet data once it's
// available. Run with `npm run verify:parser`.
import { MOCK_OCR_DOCS } from '../src/lib/mockData'

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
