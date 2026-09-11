# Document Review Portal

A single-screen HITL (human-in-the-loop) review portal that replaces the
three-tab workflow (master sheet + Drive image + per-transaction OCR
sheet) reviewers currently use. One screen: document image on the left,
editable OCR fields and the accept/reject decision on the right.

Read `/root/.claude/plans/we-have-a-team-fancy-whisper.md` (or ask for a
copy) for the full discovery notes this was built from — the master
sheet / OCR sheet structure, the taxonomy, and every locked decision and
open question. This README covers running and setting the app up.

## Running it

```bash
npm install
npm run dev
```

By default the app runs in **demo mode** against synthetic sample data —
no Google account or setup needed. It exercises the same doc-type
schemas as the real sheets (loan, payslip, credit card, and the
Certificate-of-Employment repeating "Salary Components" table), so the
UI, filters, per-doc-type OCR forms, and the full submit flow are all
real and clickable — only the data source is fake.

### Live mode (against the real Google Sheets)

1. In Google Cloud Console, create (or reuse) a project, enable the
   **Google Sheets API** and **Google Drive API**, and create an **OAuth
   2.0 Client ID** (Application type: Web application). Add wherever
   you'll serve this app from (e.g. `http://localhost:5173` for local
   dev) under Authorized JavaScript origins.
2. Share the master sheet with each reviewer's actual Google account as
   an **Editor** — not "anyone with the link" (that was deliberately
   ruled out for the master sheet; the OCR sheets are fine as-is, they're
   already "anyone with the link → Editor"). A reviewer must sign into
   the portal with the same Google account that was added here.
3. Copy `.env.example` to `.env.local` and fill in `VITE_GOOGLE_CLIENT_ID`
   and `VITE_MASTER_SHEET_ID`.
4. `npm run dev` — you'll get a real "Sign in with Google" screen instead
   of demo mode.

## What it does

- **Filters** — Date (maps to the master sheet's date-named tab),
  Reviewer, Document Type, Status, and API Called (a 3-state filter: any
  / done only / not done — not a plain distinct-values dropdown, per the
  confirmed spec). Document Type filters by *base* type
  (payslip/credit/loan/coe — see `taxonomy.ts` `baseDocType`), not the
  exact `loan_0`/`loan_1` tab name — "show me payslips", not "show me
  specifically the 2nd loan doc of a transaction" — and, like the
  Reviewer filter, only lists types actually present in the loaded date
  tab rather than a fixed list.
- **Batched row loading** — a production date tab can run into the
  thousands of rows (~3000 observed). Fetching that in one
  `spreadsheets.get` — especially with hyperlink/validation metadata on
  every cell — produces a JSON response big enough to hang or crash the
  reviewer's browser tab. `lib/masterSheet.ts` → `fetchMasterRows` instead:
  probes the real row count with one cheap plain-values read, then pulls
  the full grid in pages of 500 rows, skipping `dataValidation` entirely
  for this read (it's never used here, and Sheets repeats a rule's whole
  option list on every cell it's attached to — expensive over thousands of
  rows). The queue becomes usable after the first page lands rather than
  waiting on the whole tab; the status bar shows "Loading documents… N /
  total" while later pages stream in behind it.
- **Queue** — the filtered rows, click one to open it.
- **Document view** — image or PDF, detected from the file's real content
  type (a submitted document is just as often a scanned multi-page PDF as
  a single image). Images get custom pan/zoom (ctrl+wheel/pinch, or
  click-drag — anchored under the cursor, full range in every direction);
  PDFs render through the browser's own built-in PDF viewer via an
  iframe, which already has multi-page scrolling, its own zoom, and text
  search — no bundled PDF library needed. A prev/next switcher appears
  when a transaction has more than one document (the `loan_0`/`loan_1`
  case, or two different document types sharing one transaction — a
  sibling isn't required to share a document type). This switcher moves
  between siblings independently of the active queue filters: a sibling
  can easily not match the current Reviewer/Status/Doc type/API called
  filter (already reviewed, assigned to someone else, a different doc
  type, ...) and must still be reachable — `usePortal.ts`'s auto-select
  guard only re-validates the current selection when the *filtered queue
  itself* changes, not on every selection change, so navigating to a
  filtered-out sibling doesn't immediately get overridden back to
  `filteredRows[0]` (a real bug this fixed — the Next/Previous buttons
  looked like they simply didn't work).
- **OCR editor** — parsed directly from the transaction's OCR tab, so it
  adapts to whatever fields and sections that document type actually
  has, including a repeating table (Certificate of Employment's "Salary
  Components"). Every field is editable — a label column on the left
  (narrow, fixed-width) and a wider input on the right, one field per
  row, so the input has the room. An untitled section (the common case —
  most OCR tabs' first block has no section header of its own) shows a
  plain "Fields" label rather than guessing or leaving it blank. Field-
  level remarks the OCR pipeline itself attaches (the sheet's optional
  3rd column) surface as an inline warning icon, full text on hover.
  Whichever OCR field's own value cell happens to have a Sheets
  data-validation rule attached (Company Category, in practice — a
  controlled/tokenized value, not free OCR text) gets live suggestions
  read off that rule (`lib/ocrParser.ts` → `attachFieldValidation`, a
  small "▾ SHEET" badge marking it), via a native `<input list>` +
  `<datalist>` — **suggestions, not a locked dropdown**: it's still a
  plain text field underneath, so an OCR-extracted value that doesn't
  exactly match any of the sheet's options is never blocked or silently
  reset, it just stays as-is and editable. This is generic, not hardcoded
  to Company Category specifically — any field the OCR pipeline attaches
  a rule to picks up suggestions automatically. Every date-shaped or
  number-shaped OCR value gets written with a
  leading `'` (`lib/ocrParser.ts` → `forceTextIfDateOrNumeric`), forcing
  Sheets to store it as plain text instead of trying to auto-parse it —
  and, per explicit direction, this is **not** limited to fields the
  reviewer actually edited: `buildFieldEdits` force-(re)writes every
  date/numeric field on every submit, touched or not (an untouched OCR
  date is already correct at the source — protecting it from Sheets'
  own auto-parse corruption shouldn't require a reviewer to open and
  retype every field by hand). Table rows (e.g. Salary Components'
  Amount) get the same treatment automatically — they're rewritten in
  full on every submit already. A genuinely untouched plain-text field
  is left alone, so this doesn't turn every submit into a full-document
  rewrite.
- **Decision panel** — Category (Valid / Invalid / Incomplete), Rejection
  Reason (a flat list per document type — payslip/credit/loan/coe each
  have their own), Fraud Reason (multi-select, independent of Category —
  confirmed it can apply regardless of Valid/Invalid/Incomplete),
  Reclassify document type, and free-text notes. Submit writes the OCR
  corrections and the decision back — in demo mode to local state, in
  live mode as two Sheets API batch writes (OCR tab, then the master
  row) — then advances to the next queued document.
- **Dropdown sources** — Category / Fraud Reason / Reclassify options are
  read from the master sheet's own data-validation rules at runtime
  (`lib/masterSheet.ts` → `readLiveTaxonomy`), so the taxonomy can be
  changed later without redeploying the app, per the explicit request.
  Rejection Reason is different: the master sheet has one shared
  "Rejection Reason" column for every document type, so that column's own
  dropdown rule can only ever be a single flat list — it structurally
  cannot vary loan vs. payslip vs. credit vs. coe. The actual per-doc-type
  breakdown is read from a dedicated **"Ref" tab** in the same
  spreadsheet (one column per document type, headed
  `Rejection Reason - <type>`) — see `readRejectionReasonRefRows` /
  `readRejectionReasonRefSheet` in `lib/masterSheet.ts`. Column order and
  count on that tab aren't assumed; each header is parsed for its trailing
  "- <type>" to know which document type it belongs to. `lib/taxonomy.ts`'s
  `FALLBACK_TAXONOMY` (the exact lists provided during discovery) is only
  a fallback for when a rule — or the Ref tab, or one of its columns —
  can't be read, tracked **per document type independently** (see
  `Taxonomy.source.rejectionReasonByDocType`), not as one blended flag.
- **Date filter tabs** — only tabs named like `dd-mm-yyyy` (e.g.
  `03-09-2026`) are treated as a day's queue (`lib/masterSheet.ts` →
  `isDateTabTitle`). Other tabs living in the same spreadsheet for other
  purposes (the "Ref" lookup above, a "Reviewers" notes tab, ...) are
  filtered out of the Date dropdown and can't accidentally become the
  "most recent tab" the app defaults to or samples Category/Fraud
  Reason/Reclassify's data-validation from.

## What "protected" means here — and what's still just a display problem in Sheets

The `'`-prefix fix (see "What it does" → OCR editor) writes each
date/numeric value's digits through **exactly as they already read** in
the OCR sheet — it doesn't re-derive or swap a day/month order, it just
stops Sheets from ever trying to auto-parse (and potentially mangle) that
string. Per explicit direction: an OCR date the reviewer never touched is
already correct dd/mm/yyyy at the source, so this app takes that as given
rather than trying to detect or re-interpret which convention a value
uses — there was never a need to solve that (genuinely ambiguous)
problem, only to stop Sheets' own auto-parsing from acting on it. Once a
date/numeric field has been through one submit, its cell holds forced
plain text and Sheets won't touch it again, in that display convention,
from then on.

## Known gaps — unverified against the live Google APIs

This was built without a live Google Cloud OAuth client or a browser
session authenticated against the real sheets, so the pieces below are
implemented per the Sheets API v4 contract but **haven't been exercised
against the real spreadsheets yet**. Treat live mode as needing a
verification pass, not as proven:

- **PDF rendering** — the mechanism (fetch bytes via the Drive API,
  detect `application/pdf` from the response's content type, embed the
  resulting blob URL in an `<iframe>`) is confirmed to work as a browser
  capability — verified directly against a hand-built test PDF, which
  correctly triggered Chromium's native PDF viewer chrome in an iframe,
  independent of this app's own auth flow. Not yet exercised against a
  *real* PDF coming out of the actual master sheet's Drive Link column,
  so still worth a real check.
- ~~Resolving `Image URL` / `Drive Link` / `Sheet URL`~~ — **confirmed
  working** against the live sheet: `sheetsApi.getGridData`'s `hyperlink`
  field read does resolve these link chips correctly.
  One correction and one follow-on issue found: the document image is
  resolved from **`Drive Link`, not `Image URL`** — the two columns aren't
  interchangeable (per the user; what `Image URL` is actually for is still
  an open question). And the resolved Drive Link is a Drive *view* link
  (an HTML viewer page — fine for the "Open in Drive" navigation, which is
  a plain `<a href>`), not a raw-image URL, so it can't be dropped
  directly into an `<img src>`. `lib/driveApi.ts` now
  fetches the file's actual bytes through the Drive API (with the
  reviewer's own token) and hands the browser a `blob:` URL instead — see
  its comments for the full reasoning. Still worth watching for: this
  will surface a 403 if a reviewer's account can see the *sheet* but not
  the underlying *image file* in Drive (they're separate permissions) —
  `imageLoadError` in the UI will say so explicitly if that happens.
- **Data-validation reads** (`readLiveTaxonomy`) — the rejection-reason
  dropdown still looked incomplete after adding `ONE_OF_RANGE` support
  (previous entry below). First found and fixed one real cause:
  `mergeTaxonomy` was *intersecting* the live list against the hardcoded
  per-doc-type fallback ("only offer a reason that's both relevant to
  this doc type per our guess AND present in the live list") — meaning
  any reason the real sheet had that wasn't already in the hardcoded list
  got silently dropped. That fix used the live list as-is, unfiltered —
  but for *every* document type at once, because the master sheet's
  Rejection Reason column is one shared column across all rows: its own
  data-validation rule (if any) is necessarily a single flat list and
  structurally cannot vary loan vs. payslip vs. credit vs. coe. That's
  what surfaced next: a payslip document showing loan-only reasons like
  "EMI Amount Missing" in its dropdown, because "unfiltered" still meant
  "the same list for everyone."

  **Actually fixed** by reading the per-doc-type breakdown from a
  different place entirely: a dedicated **"Ref" tab**, added to the
  master spreadsheet by hand, with one column per document type headed
  `Rejection Reason - <type>` (`readRejectionReasonRefRows` /
  `readRejectionReasonRefSheet` in `lib/masterSheet.ts` — the parsing
  half is pure and covered by `npm run verify:parser` against the real
  Ref tab's content, including its jagged/truncated row shapes). The
  master sheet's own Rejection Reason column validation rule is no longer
  read for this field at all — it was never capable of encoding a
  per-doc-type list in the first place, unfiltered or not.

  **This is self-diagnosing in the UI**, not something to take on faith:
  `Taxonomy.source` is tracked per field (Category, Fraud Reason,
  Reclassify), and **per document type** for Rejection Reason
  specifically (`source.rejectionReasonByDocType`) — since each type's
  list now comes from its own Ref-tab column independently, one type's
  column can be live while another's is missing or empty. The Decision
  panel shows a small badge next to each field — "From sheet" or
  "Fallback list" — with a tooltip naming the option count. If Rejection
  Reason says "Fallback list" for a given document type, that type's
  column on the Ref tab is either missing, empty, or the tab isn't named
  exactly "Ref" — that's the thing to check. Also bumped how many rows
  `readLiveTaxonomy` samples for Category/Fraud Reason/Reclassify (5 ->
  25) so an early run of blank cells on a fresh date-tab doesn't look
  like "no rule" when there is one.
- ~~`extractValidationList` only handled `ONE_OF_LIST`~~ — also resolves
  `ONE_OF_RANGE` (options pulled from a range elsewhere in the
  spreadsheet, a very common way to back a shared dropdown).
- **The OCR-tab parser** (`lib/ocrParser.ts`) was verified against
  fixture text pulled directly from the real sheets during discovery
  (`npm run verify:parser` re-runs this check against `lib/mockData.ts`),
  but not against a live API read — Sheets' row-truncation behavior
  (trailing empty cells dropped) is assumed to match what was observed
  through the Drive content-reading tool used for discovery.

  **Found live, and fixed:** `looksLikeHeaderRow`'s table-header guess used
  to trust *any* non-blank row as "looks like a table header, so whatever
  came before it must be a section title" — but an ordinary field/value
  row (`"Status of Employment", "Present"`) has that exact same shape. So
  a real field whose OCR value came back blank (an unavoidable one-cell
  row — see the parser's module comment) sitting right before another
  plain text field got misread as a section title, with the field after
  it misread as a bogus table header. Symptom in the UI: a field silently
  vanishing from the form (its label eaten as a fake section "title")
  right next to a garbled table with an Add row button and
  random-looking column names — a real field's name, sitting where a
  column header should be, is never editable (headers are always plain
  text, never inputs), which is what made this look like "some fields
  just can't be edited." Now requires the row after the candidate header
  to actually look like a table's first data row (2+ cells, at least one
  numeric-looking, per the disambiguation this file already documented
  but never actually implemented) rather than merely non-blank — an
  ordinary two-field sequence essentially never has a numeric-looking
  cell in the second field, so it's no longer mistaken for one. Covered
  by a dedicated regression case in `verify:parser` reproducing the exact
  row shape that triggered it.
- **Newly-added Salary-Components-style table rows aren't written back
  yet.** "Add row" is fully functional in the UI (and included in what a
  submit tries to save), but only edits to *existing* sheet rows
  currently generate a write — a genuinely new row needs
  `values.append`-style insertion, which isn't wired up. Removing a row
  added this session works locally; there's no delete-row support for
  rows that already exist in the sheet.
- ~~`Category` → `Status` mapping~~ — **resolved, and reversed**: they're
  independent fields, each set directly by the reviewer (a "Document
  category" control for Valid/Invalid/Incomplete, a separate "Decision"
  control for Approve/Reject) — not one derived from the other. A Valid
  document can still be Rejected. Rejection Reason is gated on
  Decision=Reject, not on Category.
- ~~"Pending" means a blank Status cell~~ — **wrong, found via the "Pending
  review" filter matching nothing against the real prod sheet.** The
  assumption (from the original discovery pass, before there was a live
  sheet to check) was that an unreviewed row's Status cell is empty. The
  real sheet instead pre-fills it with the literal text `"In Progress"`.
  `types.ts` → `isPendingStatus()` is now the one place that decides
  "has this row been decided yet?" (true for `"In Progress"` *or* a
  genuinely blank cell) — the queue filter, the pending count, and the
  queue's grey-out styling all call it instead of comparing to `''`
  directly, so they can't drift out of sync with each other again the way
  this bug happened. `usePortal.ts` → `seedDraft` also normalizes
  `"In Progress"` to `''` when seeding the Decision panel's draft, so the
  sheet's placeholder text is never mistaken for an actual Approve/Reject
  choice a reviewer made (which would otherwise have let Submit fire
  without the reviewer ever picking one).
- **Company Category live suggestions (`attachFieldValidation`) — genuinely
  untested against a real OCR tab's cell.** Built on the working
  assumption that the OCR pipeline attaches an actual Sheets
  data-validation rule to that field's value cell (plausible — the master
  spreadsheet's own notes describe other OCR fields, like Loan Type and
  Coverage Period, as "strictly choose among the following only" codes,
  and Company Category's real values look tokenized the same way — but
  not confirmed by directly inspecting a live cell's validation rule, which
  wasn't reachable with the tools available while building this). If it
  turns out no such rule exists, the field just falls back to a plain
  input with no "▾ SHEET" badge, exactly like any other field — self-
  diagnosing the same way the rest of this app's sheet-driven dropdowns
  are, so this either works visibly or fails obviously, nothing silent.
  Worth a real check against a live document before relying on it.
- **Auth** uses Google Identity Services' implicit token-client flow —
  no refresh token, so a session needs re-auth after the access token
  expires (~1 hour). Fine for a first pass; a longer-lived session would
  need the authorization-code flow instead (needs a backend to exchange
  the code, which the current no-backend architecture deliberately
  avoids — worth a conscious tradeoff decision if this becomes a problem
  in practice).

## Project structure

```
src/
  lib/
    types.ts          domain types (MasterRow, OcrDocument, Taxonomy, ...)
    config.ts          env var / demo-mode resolution
    googleAuth.ts       Google Identity Services sign-in wrapper
    sheetsApi.ts        thin Sheets API v4 fetch wrapper
    masterSheet.ts       master-sheet row parsing + write-back + live taxonomy read
    ocrParser.ts          generic OCR-tab section parser (see comments — this is the trickiest part)
    taxonomy.ts            fallback taxonomy + live/fallback merge
    presentation.ts          purely cosmetic helpers (badge colors, avatar initials)
    mockData.ts               demo-mode fixtures (also the parser's test fixtures)
  hooks/usePortal.ts    all app state + data-loading + submit logic
  components/            presentational React components
scripts/verify-parser.ts  sanity check for ocrParser.ts against mockData.ts fixtures
```
