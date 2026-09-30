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
  Reviewer, Document Type, Status, API Called (a 3-state filter: any
  / done only / not done — not a plain distinct-values dropdown, per the
  confirmed spec), and **Start after row** (skip straight to a given
  sheet row instead of reviewing from the top of the date tab — e.g. "500"
  to pick up at row 501). Document Type filters by *base* type
  (payslip/credit/loan/coe — see `taxonomy.ts` `baseDocType`), not the
  exact `loan_0`/`loan_1` tab name — "show me payslips", not "show me
  specifically the 2nd loan doc of a transaction" — and, like the
  Reviewer filter, only lists types actually present in the loaded date
  tab rather than a fixed list. Start-after-row is more than a view
  filter: it changes where `fetchMasterRows` *starts fetching* (see
  below) — rows before it are never requested over the network at all,
  not just hidden once loaded, so setting it also means less data pulled
  on a slow connection when a reviewer only cares about the tail of a big
  tab. Applies on blur/Enter, not on every keystroke, since (unlike the
  other filters, which just re-filter rows already in memory) changing it
  triggers a real re-fetch.
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
  search — no bundled PDF library needed.

  **Every row — every Transaction ID + Request ID + Document Type
  combination — is its own independent queue card**, opened, decided, and
  submitted on its own — including when two rows share a Transaction ID
  (the `loan_0`/`loan_1` case, or two different document types under one
  transaction). There is deliberately no separate "next document in this
  transaction" switcher inside the document viewer: an earlier version
  had one, and it turned out genuinely difficult to get right (a sibling
  can easily not match the active Reviewer/Status/Doc type/API called
  filter — already reviewed, assigned to someone else, a different doc
  type — so it needed a navigation path that bypassed the queue's own
  filtering without fighting the queue's "auto-select a valid row" logic;
  simplified away instead of debugged further under time pressure). Two
  cards sharing a Transaction ID are still visually easy to spot side by
  side in the queue list — same ID text at the top of each card — a
  reviewer just clicks between them like any other two rows. Two cards
  can also share the same Transaction ID *and* the same base document
  type (two pages of one payslip, e.g. `payslip_0`/`payslip_1` — or,
  found live, an actual upstream double-processing: the same page
  uploaded and OCR'd twice a minute apart, producing two rows that are
  genuine duplicates, not just look-alikes) — the friendly doc-type badge
  alone can't tell those apart, so the queue card also shows the raw tab
  name (`payslip_0` vs `payslip_1`) next to it. If two cards show the
  *exact same* raw tab name **and** the exact same Request ID for the
  same transaction, that's not an app bug — it's the pipeline having
  genuinely processed that document twice, worth flagging upstream rather
  than something this portal can reconcile on its own.

  **Transaction ID + Request ID + Document Type, all three together — not
  Request ID alone, and not Transaction ID + Document Type alone — is the
  composite key this app treats as a row's unique identity.** This went
  through two corrections as real production data kept contradicting each
  narrower assumption:
  1. An earlier version keyed everything on Request ID alone, on the
     assumption (from the original discovery notes) that it was "a UUID,
     one per document." Real data showed multiple rows under one
     transaction — even rows of *different* document types — sharing the
     exact same Request ID. Since `Array.prototype.find` always resolves
     to the *first* matching row, every queue card with a colliding
     Request ID silently opened onto the same first row's data
     underneath, no matter which card a reviewer actually clicked — the
     root cause behind the "two cards look selected at once" / "can't
     navigate to the next document" reports.
  2. The fix for that — Transaction ID + Document Type — then turned out
     to have its own gap: one transaction can carry *more than one*
     Request ID, each producing its own set of document types (e.g. two
     separate `payslip_0`/`payslip_1` pairs under one Transaction ID,
     eight rows total but only 4 distinct Transaction-ID+Document-Type
     combinations among them). Two of those rows would have collided
     under that two-part key despite being genuinely different documents.

  `lib/types.ts` → `masterRowKey` (`` `${transactionId}::${requestId}::${documentType}` ``)
  is now the single key used everywhere row identity matters: queue
  selection/highlighting, `OcrDocument.rowKey` (what the loaded OCR data
  is checked against before it's trusted or written back), and
  local-state updates after a submit. Each of the three fields is what
  disambiguates a specific real collision found live — Document Type
  catches case 1, Request ID catches case 2, Transaction ID is what
  scopes both of them to begin with — so none of the three is dropped in
  favor of the other two. Request ID is still shown to reviewers as real
  sheet data (in the transaction summary and the queue card's tooltip) —
  it's just never trusted as a lookup key *by itself*. The one case even
  this composite key can't disambiguate is a genuine upstream duplicate —
  the exact same document (same transaction, same request, same type)
  uploaded and processed twice — which has no reliable per-row identifier
  at all in this data; see the doc-type-badge paragraph above for how
  that case is surfaced instead. The OCR-load effect clears
  `currentDoc`/`draftSections` synchronously the instant the selected row
  changes — before the async fetch even starts — so there's no window
  where a previous document's data sits on screen mislabeled as the new
  selection while the real fetch is still in flight; `submit()`
  independently refuses to run (and the Submit button disables, showing
  "Loading document…") unless the currently loaded OCR document's
  `rowKey` actually matches the selected row's `masterRowKey`, rather
  than either silently skipping the OCR write-back or, worse, writing it
  into a different document's tab.
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
- **Automatic rule checks** (`lib/ruleChecks.ts`) — currently one check:
  a document is flagged **Outdated Document** when its relevant date
  field is more than 60 days in the past (Payslip's "Salary Period End
  Date", Certificate of Employment's "Document Issued Date" — no rule
  yet for loan/credit). Deliberately does **not** run automatically on
  OCR load or on every keystroke — per explicit direction, it only runs
  when the reviewer clicks the **"Submit OCR corrections"** button added
  at the very end of the OCR editor, so it's always checking the
  reviewer's own corrected value, never a possibly-misread raw OCR date
  (see `forceTextIfDateOrNumeric`'s own comments on how often that
  happens). That button is a separate, purely local action from the
  Decision panel's actual "Submit & Next" — it never writes to Sheets by
  itself, it only runs the check and, if triggered, sets
  `rejectionReason`/`category`/`status` the same way picking a reason
  from the dropdown does (see the Decision panel bullet below) — fully
  overridable by the reviewer afterward, same as a manual pick. The
  flagged field also gets an inline warning banner directly under
  itself (a red-bordered input + explanation), per explicit direction
  ("show a warning near the field"), not just a generic page-level
  banner; every other outcome (a doc type with no rule, a field that
  couldn't be found/parsed, or a genuine clean check) gets its own status
  line under the button instead, so clicking it never feels like it did
  nothing. Editing anything afterward clears the last check's result
  (it's now stale) without touching whatever `rejectionReason`/
  `category`/`status` are currently set to — those only get auto-cleared
  if a **later** re-check comes back clean AND they still exactly match
  what the rule itself set, so a reviewer's own manual override in
  between is never silently overwritten. Covered by regression cases in
  `verify:parser` (date parsing, both document types, the not-applicable/
  unparseable paths) and confirmed end-to-end via Playwright against
  demo mode — the demo fixture's own Certificate of Employment date
  happened to be genuinely more than 60 days old as of this build, so
  the "outdated" path was exercised against a real date comparison, not
  only a synthetic one.
  - **What happens right after the click** (per explicit direction — the
    button's effect wasn't obvious enough before this): if any of the
    three checks this button runs needs the reviewer's attention — the
    outdated-document check (flagged, or a date this couldn't even
    parse), the Payslip-only Net Pay declared-vs-calculated check (a
    mismatch), or the Payslip-only Duration sanity check (over 31 days)
    — the OCR panel smooth-scrolls straight to that field's warning so
    it's on screen without the reviewer having to go looking for it, and
    stays on the OCR tab so they can either fix it and re-submit or leave
    the flag as correct and move on themselves. Priority when more than
    one fires on the same click: outdated-document first (a more
    foundational problem — the document itself may not even be current),
    then Net Pay mismatch (it auto-adds a Fraud Reason, so it must not go
    unnoticed), then Duration (informational only). Anything else — every
    check clean, or a document type none of them apply to — has nothing
    left to look at here, so it switches the panel to the Decision tab
    automatically. `confirmOcrFields` (`usePortal.ts`) returns all three
    check results it just computed (`ConfirmOcrResult`) so `OcrEditor`'s
    click handler can act on them in the same click, rather than a
    separate effect watching for the results to change — an effect keyed
    off them would re-fire every time the OCR tab remounts (e.g. the
    reviewer switching back to it after being moved to Decision), which
    would bounce them straight back. Verified via Playwright: the
    outdated-coe case scrolls the flagged field into the actual viewport
    (not just present somewhere off-screen) and stays on OCR, a clean
    payslip case switches straight to Decision, fixing the flagged date
    and re-submitting also switches to Decision, a genuine Net Salary
    mismatch scrolls to that field too instead of silently switching tabs
    with an unnoticed Fraud Reason added, and a Duration pushed past 31
    days (by extending Salary Period End Date) scrolls to it with the
    warning banner visible, leaving Category/Status/Fraud Reason all
    completely untouched.
- **Payslip auto-calculated fields** (`lib/payslipCalc.ts`,
  `lib/calculator.ts`) — Payslip-only, per explicit direction:
  - **Duration** recomputes automatically from Salary Period Start/End
    Date (inclusive day count — confirmed against the real fixtures:
    01/08–15/08 reads back as Duration "15") every time either date
    changes, however that happened (typing directly, or via the OCR
    load itself). Still a normal editable field — typing over it
    sticks until one of the two dates changes again.
  - **Duration sanity check** (`checkDurationReasonable` in
    `lib/payslipCalc.ts`) — on "Submit OCR corrections", a Duration over
    31 days shows a warning next to the field (a salary period longer
    than a month almost always means the dates are wrong). Purely
    informational, per explicit direction: **it takes no action at
    all** — no Fraud Reason, no rejection — it's entirely the
    reviewer's call whether to correct the OCR dates or flag "Date
    Inconsistent" in Fraud Reason themselves. Stays at warning/amber
    severity throughout (never the red/danger styling the outdated-
    document or Net Pay checks use for their auto-marking outcomes,
    since this one never marks anything). A too-long Duration also
    joins the "Submit" button's scroll-to-field priority chain — after
    an outdated-document flag and a Net Pay mismatch, since those two
    actually changed something the reviewer needs to see, but still
    ahead of the plain auto-navigate-to-Decision default, so this
    heads-up is never silently skipped past either.
  - **Gross Salary = Taxable Income + Non-Taxable Income.** Taxable
    Income, Non-Taxable Income, and Deduction are **brand new fields
    that exist only in this portal** — per explicit direction, they're
    never written to the real OCR sheet. That's a structural guarantee,
    not a runtime check: they live in their own `payslipCalculator`
    state in `usePortal.ts`, completely separate from
    `draftSections`/`OcrSection` — the one data structure
    `buildFieldEdits` ever diffs to build a Sheets write, so there is no
    code path that could leak them into it even by accident.
  - **Net Salary stays exactly as OCR'd/declared — it is never
    overwritten**, per explicit direction ("generally net pay is
    already present from the OCR, we can keep that as declared"). A
    second, portal-only figure — **Calculated: Gross Salary − Deduction**
    — is shown directly under the real field instead, purely as a
    reference for the reviewer to compare by eye; it carries a
    "DECLARED" badge on the real field itself so it's visually distinct
    from the "⟳ AUTO" fields nearby.
  - **Declared-vs-calculated Net Pay check** (`checkNetPayConsistency`
    in `lib/payslipCalc.ts`) — like the outdated-document check, this
    only ever runs on a "Submit OCR corrections" click, against the
    reviewer's own corrected values. If the declared Net Salary and the
    calculated figure don't match (beyond a one-cent rounding
    tolerance), **"Total Inconsistent" is auto-added to Fraud Reason**
    — per explicit direction, this is a soft signal only: Category and
    Status are left completely untouched, unlike the outdated-document
    check (**no auto-rejection**). A later re-check that comes back
    matching removes "Total Inconsistent" again, but only if it's still
    exactly the tag this rule itself added — any other fraud reason the
    reviewer picked separately is left alone, same symmetric-revert
    rule as the outdated-document check. Nothing is compared until the
    reviewer has actually used the calculator (an untouched calculator
    never produces a false mismatch) or the declared field is blank/
    non-numeric — both come back `unavailable`, not a false flag.
    "Submit OCR corrections" treats a mismatch the same as an outdated-
    document flag: it scrolls the OCR panel to the Net Salary field and
    keeps the reviewer on the OCR tab (instead of auto-advancing to
    Decision) precisely because this auto-adds a Fraud Reason tucked
    inside a popover on the Decision tab — silently landing there
    without ever having seen why would defeat the whole point of that
    button's UX (see the entry above on scrolling to a flagged field).
  - **A "calculator" convenience on five fields** — Taxable Income,
    Non-Taxable Income, Deduction (the three new ones above), plus the
    two real fields **SSS Premium** and **PhilHealth Premium** — per
    explicit direction, each is two inputs: a raw sum the reviewer
    types (e.g. `100+100`), and the evaluated total next to it (`200`),
    via a small hand-written expression evaluator
    (`lib/calculator.ts` → `evaluateExpression` — deliberately not
    `eval`/`Function`, just +, −, ×, ÷ and parentheses). For SSS/
    PhilHealth Premium the computed total syncs into that real field
    (the expression box itself stays portal-only, same as the three new
    fields). An untouched calculator field never overwrites a real,
    OCR-extracted value with a guessed zero — Gross Salary only starts
    computing once the reviewer has used Taxable or Non-Taxable Income
    at least once, and the calculated Net Pay reference only once Gross
    is computing too (Deduction alone, with neither income field
    touched, has nothing to subtract from and is left alone).
  - Every auto-calculated real field (Duration, Gross Salary, SSS
    Premium, PhilHealth Premium) carries a small "⟳ AUTO" badge next to
    its label, so it's visually clear why it might change on its own —
    same visual language as the existing "▾ SHEET"/"FALLBACK LIST"
    source badges elsewhere in this panel. Net Salary is deliberately
    NOT in this set (see above).
  - Covered by regression cases in `verify:parser` (the expression
    evaluator's arithmetic/edge cases, Duration's exact fixture-matched
    day count, the Gross/calculated-Net activation rules,
    `checkNetPayConsistency`'s not-applicable/unavailable/match/mismatch
    paths, and `checkDurationReasonable`'s not-applicable/unavailable/
    ok/too-long paths, including the exact 31-day boundary staying "ok"
    rather than "greater than") and confirmed end-to-end via Playwright
    against demo mode: editing Salary Period End Date live-recomputes
    Duration, filling in the calculator fields correctly drives Gross
    Salary while leaving an untouched PhilHealth Premium exactly as OCR
    left it, Net Salary stays at its declared value throughout, a
    genuine mismatch scrolls to it and adds "Total Inconsistent" without
    touching Category/Status, fixing the calculator to match removes
    that tag again and advances to Decision, and pushing Duration past
    31 days scrolls to its warning banner while leaving Category/Status/
    Fraud Reason completely untouched.
- **Decision panel** — OCR details is still the tab that opens by
  default when a document is selected (correcting fields comes before
  deciding); a brief change to default to Decision instead — reasoning
  that most reviews end in a rejection — was reverted per explicit
  direction, that didn't make sense as the starting point. Within the
  Decision panel itself, Rejection Reason is the first field in it,
  always visible rather than only appearing after clicking Reject: most
  reviews end in a rejection, so the reviewer should be able to pick the
  reason immediately without extra clicks once they get to that tab.
  Picking a reason there sets
  Category=Invalid and Decision=Manually Rejected automatically — the
  common "reject with a reason" case is one click instead of three.
  Approving is still a deliberate separate action (click Approve, pick
  Valid), and switching to Approve after picking a reason clears it, same
  as before. Below the reason: Category (Valid / Invalid / Incomplete),
  Decision (Approve / Reject), Fraud Reason (multi-select, independent of
  Category — confirmed it can apply regardless of
  Valid/Invalid/Incomplete), Reclassify document type, and free-text
  notes. Rejection Reason itself is a flat list per document type —
  payslip/credit/loan/coe each have their own. Submit writes the OCR
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
  All of the above (Category, Fraud Reason, Reclassify, Rejection Reason
  by doc type) is read only **once per sign-in**, not per document or per
  date-tab switch — the effect that calls `readLiveTaxonomy` depends only
  on `user`. It's also cached to `sessionStorage` (`lib/taxonomy.ts` →
  `loadCachedTaxonomy`/`saveCachedTaxonomy`) so a page refresh mid-shift
  (a real scenario on a flaky connection) reuses it instantly instead of
  re-reading the sheet — `sessionStorage` clears itself when the tab
  closes, which is deliberately exactly "per session" and nothing longer,
  so nobody's working off yesterday's rejection-reason list tomorrow.
  **Company Category is the one exception** — it's read live, per
  document, straight off that specific OCR tab's own cell
  (`ocrParser.ts` → `attachFieldValidation`), a completely separate code
  path that this cache never touches, since it's application-specific
  rather than shared taxonomy.
- **Date filter tabs** — only tabs named like `dd-mm-yyyy` (e.g.
  `03-09-2026`) are treated as a day's queue (`lib/masterSheet.ts` →
  `isDateTabTitle`). Other tabs living in the same spreadsheet for other
  purposes (the "Ref" lookup above, a "Reviewers" notes tab, ...) are
  filtered out of the Date dropdown and can't accidentally become the
  "most recent tab" the app defaults to or samples Category/Fraud
  Reason/Reclassify's data-validation from.
- **Retry with backoff** — every Sheets/Drive request (reads and writes
  alike) automatically retries a couple of times with exponential backoff
  on a transient failure (`lib/retry.ts` → `withRetry`, used by
  `sheetsApi.ts` and `driveApi.ts`) — a dropped packet on a weak
  connection shouldn't force a reviewer to manually retry by hand. Never
  retries a deliberate cancellation (an aborted request — see the
  AbortController wiring above) or an auth/permission error (401/403/
  404), since a retry can't fix either of those.
- **Self-hosted fonts, deferred sign-in script** — IBM Plex Sans/Mono are
  bundled via `@fontsource` (imported in `main.tsx`) instead of pulled
  from an external fonts.googleapis.com stylesheet, removing a render-
  blocking round trip on every fresh load. Google Identity Services'
  script is no longer loaded unconditionally in `index.html` either —
  `lib/googleAuth.ts` → `loadGsiScript` injects it lazily on the first
  actual `signIn()` call, so a returning reviewer with a still-valid
  stored token (the common case) never fetches it at all. `index.html`
  also preconnects to `sheets.googleapis.com`/`www.googleapis.com` now,
  the two domains that matter most for this app's own data, not just the
  font host.
- **Queue list rendering** — each row is a memoized component
  (`QueueRow` in `components/QueueList.tsx`) so an unrelated re-render
  (search input, sync-status ticking, a filter change) doesn't re-render
  every row in the queue, only the ones whose own data actually changed.
  Each row also sets `content-visibility: auto`, a cheap browser-native
  way to skip layout/paint work for rows currently scrolled out of view —
  matters more as a lightly-filtered queue on a big date tab grows into
  hundreds of live rows.

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

- **Request cancellation + next-image prefetch** — three related changes
  to `hooks/usePortal.ts`'s image/OCR-doc effects, all real-mode-only
  code paths that (like everything else in this section) haven't been
  exercised against a live Drive/Sheets session: (1) the OCR-doc load no
  longer waits on `attachFieldValidation`'s validation-option lookup
  before rendering fields — they appear as soon as parsed, with live
  suggestions (Company Category) patched in a moment later; (2) the
  image and OCR-doc fetches now carry a real `AbortController`, so
  switching rows mid-download actually stops the request instead of just
  ignoring its result; (3) the next queue row's image is speculatively
  prefetched once the current one finishes loading, skipped on a
  connection the Network Information API reports as slow/metered
  (`driveApi.ts` → `isSlowConnection`), bounded to exactly one row ahead.
  Demo mode doesn't exercise any of this (it has no real Drive files to
  fetch), so this was only verified by confirming demo mode itself still
  works correctly end to end — the actual network behavior (does the
  abort really cancel the in-flight request, does the prefetched blob
  get picked up on the next click, does `navigator.connection` behave as
  expected in a real browser) needs a check against live credentials.
- **PDF rendering** — the mechanism (fetch bytes via the Drive API,
  detect `application/pdf` from the response's content type, embed the
  resulting blob URL in an `<iframe>`) is confirmed to work as a browser
  capability — verified directly against a hand-built test PDF, which
  correctly triggered Chromium's native PDF viewer chrome in an iframe,
  independent of this app's own auth flow. Not yet exercised against a
  *real* PDF coming out of the actual master sheet's Drive Link column,
  so still worth a real check.
- ~~Resolving `Image URL` / `Drive Link` / `Sheet URL`~~ — **confirmed
  working** against the live sheet, with one real bug found and fixed
  along the way. `sheetsApi.getGridData`'s `hyperlink` field read
  resolves a classic blue-underlined link or `HYPERLINK()` formula
  correctly (confirmed for `Sheet URL`, whose visible cell text is the
  full URL itself) — but `Image URL` and `Drive Link` turned out to be
  rendered as Sheets **Smart Chips** instead (the pill-with-icon link
  style; the cell's visible text is just a short label like "File
  Link"/"Drive Link", never the URL). A smart chip's target URL lives in
  a completely different API field, `chipRuns`, which `hyperlink` never
  covers — so those two columns were silently resolving to a `null`
  href on every row: an unclickable "Open in Drive" button, and no
  document image ever loading, despite the chip clearly working when
  clicked directly in Sheets. Found by pulling the real sheet's raw
  content directly and noticing `Image URL`/`Drive Link` never showed an
  actual URL anywhere, unlike `Sheet URL`. `sheetsApi.ts`'s `GridCell`
  now also requests/exposes `chipRuns`, and `masterSheet.ts`'s `link()`
  helper falls back to the first chip run's URI when `hyperlink` is
  absent — `hyperlink` still wins when a cell genuinely has both.
  Covered by a regression case in `verify:parser` reproducing this exact
  cell shape (a chip-only Image URL/Drive Link alongside a
  hyperlink-only Sheet URL, so the fallback is confirmed to fire only
  where it should).
  One correction and one follow-on issue found earlier, still true: the
  document image is resolved from **`Drive Link`, not `Image URL`** — the
  two columns aren't interchangeable (per the user; what `Image URL` is
  actually for is still an open question). And the resolved Drive Link is
  a Drive *view* link (an HTML viewer page — fine for the "Open in Drive"
  navigation, which is a plain `<a href>`), not a raw-image URL, so it
  can't be dropped directly into an `<img src>`. `lib/driveApi.ts` fetches
  the file's actual bytes through the Drive API (with the reviewer's own
  token) and hands the browser a `blob:` URL instead — see its comments
  for the full reasoning. Still worth watching for: this will surface a
  403 if a reviewer's account can see the *sheet* but not the underlying
  *image file* in Drive (they're separate permissions) — `imageLoadError`
  in the UI will say so explicitly if that happens.
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
  document can still be Rejected. Rejection Reason's *requirement* for
  Submit is still gated on Decision=Reject, not on Category — but per
  later direction the field itself is always visible (see the Decision
  panel bullet above), not only shown once Reject is picked.
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
