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
  Reviewer, Status, and API Called (a 3-state filter: any / done only /
  not done — not a plain distinct-values dropdown, per the confirmed
  spec).
- **Queue** — the filtered rows, click one to open it.
- **Document view** — image or PDF, detected from the file's real content
  type (a submitted document is just as often a scanned multi-page PDF as
  a single image). Images get custom pan/zoom (ctrl+wheel/pinch, or
  click-drag — anchored under the cursor, full range in every direction);
  PDFs render through the browser's own built-in PDF viewer via an
  iframe, which already has multi-page scrolling, its own zoom, and text
  search — no bundled PDF library needed. A prev/next switcher appears
  when a transaction has more than one document (the `loan_0`/`loan_1`
  case).
- **OCR editor** — parsed directly from the transaction's OCR tab, so it
  adapts to whatever fields and sections that document type actually
  has, including a repeating table (Certificate of Employment's "Salary
  Components"). Field-level remarks the OCR pipeline itself attaches
  (the sheet's optional 3rd column) surface as inline warning badges.
  Every date-shaped or number-shaped OCR value gets written with a
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
- **Dropdown sources** — Category / Rejection Reason / Fraud Reason /
  Reclassify options are read from the master sheet's own data-validation
  rules at runtime (`lib/masterSheet.ts` → `readLiveTaxonomy`), so the
  taxonomy can be changed later without redeploying the app, per the
  explicit request. `lib/taxonomy.ts`'s `FALLBACK_TAXONOMY` (the exact
  lists provided during discovery) is only a fallback for when a rule
  can't be read.

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
  (previous entry below). Found the actual cause: `mergeTaxonomy` was
  *intersecting* the live list against the hardcoded per-doc-type fallback
  ("only offer a reason that's both relevant to this doc type per our
  guess AND present in the live list") — meaning any reason the real
  sheet had that wasn't already in the hardcoded list got silently
  dropped, so the dropdown looked live but was quietly capped. Fixed: a
  successfully-read live list is now used as-is, unfiltered, for every
  document type (the sheet's Rejection Reason column is one shared
  column across all rows anyway, so there was never a real per-doc-type
  breakdown to preserve from the live side). The hardcoded breakdown is
  now used only when live reading fails entirely for that field.

  **This is now self-diagnosing in the UI**, not something to take on
  faith: `Taxonomy.source` is tracked per field (Rejection Reason, Fraud
  Reason, Reclassify), and the Decision panel shows a small badge next to
  each — "From sheet" or "Fallback list" — with a tooltip naming the
  option count. If it says "Fallback list" for Rejection Reason, the live
  read is failing for that specific column and that's the thing to
  chase (worth checking: does the validation rule's range live on a
  *different* sheet the signed-in account can't read, or is the rule
  simply not attached to the sample rows `readLiveTaxonomy` checks).
  Also bumped how many rows it samples (5 -> 25) so an early run of blank
  cells on a fresh date-tab doesn't look like "no rule" when there is
  one.
- ~~`extractValidationList` only handled `ONE_OF_LIST`~~ — also resolves
  `ONE_OF_RANGE` (options pulled from a range elsewhere in the
  spreadsheet, a very common way to back a shared dropdown).
- **The OCR-tab parser** (`lib/ocrParser.ts`) was verified against
  fixture text pulled directly from the real sheets during discovery
  (`npm run verify:parser` re-runs this check against `lib/mockData.ts`),
  but not against a live API read — Sheets' row-truncation behavior
  (trailing empty cells dropped) is assumed to match what was observed
  through the Drive content-reading tool used for discovery.
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
