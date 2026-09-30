import type { Taxonomy, TaxonomyFieldSource } from './types'

// Fallback taxonomy — used only when the live read of the master sheet's
// own data-validation rules (see sheetsApi.ts `readTaxonomyFromSheet`)
// fails or a given column has no rule attached. This is the source of
// truth the user provided directly; kept verbatim, including the "Grammer
// Incorrect" spelling in Fraud Reason — it must match the sheet's actual
// dropdown text exactly, not a corrected version, since these strings are
// written straight back into the sheet.
export const FALLBACK_TAXONOMY: Taxonomy = {
  category: ['Valid', 'Invalid', 'Incomplete'],

  rejectionReasonsByDocType: {
    payslip: [
      'Irrelevant Documents/Images',
      'Unreadable Document',
      'Cropped/Partial Document',
      'Outdated Document',
      'Future Date',
      'Password locked / Access Denied',
      'Employee Name Missing',
      'Employer Name Missing',
      'Tax Status Missing',
      'Gross Salary Missing',
      'Net Salary Missing',
      'Duration <= 0',
      'Duration >= 367',
      'Duration Missing',
      'Gross Pay / Net Pay < 0',
      'Basic/Regular Pay Missing',
      'Missing Issue Date',
    ],
    credit: [
      'Irrelevant Documents/Images',
      'Unreadable Document',
      'Cropped/Partial Document',
      'Outdated Document',
      'Future Date',
      'Password locked / Access Denied',
      'Bank Name is Missing',
      'Statement Date Missing',
      'Total Amount Due Missing',
      'Outstanding Balance Missing',
      'Due Date Missing',
      'Customer Name Missing',
      'Customer Address Missing',
      'Credit Limit Value < 0',
      'Credit Limit Value Missing',
      'Transaction History Missing',
      'Account Number Missing',
    ],
    loan: [
      'Irrelevant Documents/Images',
      'Unreadable Document',
      'Cropped/Partial Document',
      'Outdated Document',
      'Future Date',
      'Password locked / Access Denied',
      'Bank / Lender Name Missing',
      'Loan Statement is Missing',
      'Loan Amount Missing',
      'Interest Rate Missing',
      'Loan Tenor Missing',
      'EMI Amount Missing',
      'Outstanding Balance Missing',
      'Address Missing',
      'Statement Date Missing',
      'Transaction History Missing',
      'Loan Account Number Missing',
      'Avail Date Missing',
    ],
    coe: [
      'Irrelevant Documents/Images',
      'Unreadable Document',
      'Cropped/Partial Document',
      'Outdated Document',
      'Future Date',
      'Password locked / Access Denied',
      'Employee Name Missing',
      'Employer Name Missing',
      'Total Salary Amount Missing',
      'Total Salary Frequency Missing',
      'Missing Issue Date',
      'Salary = 0',
      'Missing Salary',
      'Employment start date missing',
    ],
  },

  fraudReasons: [
    'Font Inconsistent',
    'Partial Document',
    'Patch Edit',
    'Logo Distorted',
    'Grammer Incorrect',
    'Fabricated Template',
    'Employer Name Mismatch',
    'Company Absent in Category List',
    'Address Inconsistent',
    'Non-professional Email ID',
    'Salary Inconsistent',
    'Deduction Inconsistent',
    'Total Inconsistent',
    'Date Inconsistent',
    'Unverified TIN',
    'Abnormal Template',
    'Editable File',
  ],

  reclassifyOptions: ['payslip', 'credit', 'loan', 'coe'],

  source: {
    category: 'fallback',
    rejectionReasonByDocType: { payslip: 'fallback', credit: 'fallback', loan: 'fallback', coe: 'fallback' },
    fraudReasons: 'fallback',
    reclassifyOptions: 'fallback',
  },
}

/** Strip a trailing "_<n>" (loan_0, loan_1, payslip_0, ...) to get the base
 * document type the taxonomy and OCR-tab schemas are keyed by. Falls back
 * to the raw string for any document type the pipeline adds later that
 * doesn't follow the "<type>_<n>" convention. */
export function baseDocType(documentType: string): string {
  const match = documentType.match(/^(.*)_\d+$/)
  return match ? match[1] : documentType
}

export interface LiveTaxonomyRead {
  category?: string[] | null
  /** Per-document-type rejection reason lists, read from the master
   * spreadsheet's dedicated "Ref" tab (one column per doc type, headed
   * "Rejection Reason - <type>") — see masterSheet.ts
   * `readRejectionReasonRefSheet`. NOT read off the master sheet's own
   * Rejection Reason column: that column is shared by every document type,
   * so its data-validation rule (if any) is necessarily one flat list and
   * structurally can't vary by row/doc-type. */
  rejectionReasonsByDocType?: Record<string, string[]> | null
  fraudReasons?: string[] | null
  reclassifyOptions?: string[] | null
}

/** Combine a live read of the sheet's own data-validation rules (and, for
 * Rejection Reason specifically, the "Ref" tab — see masterSheet.ts) with
 * the hardcoded fallback above.
 *
 * Rejection Reason is merged per document type, independently: a doc
 * type whose Ref-tab column came back with values uses that list as-is;
 * one that's missing or empty falls back to the hardcoded list for just
 * that type. This also means a doc type the Ref tab has a column for but
 * this file doesn't know about (a new document type added later) still
 * comes through — the merged set of document types is the union of both,
 * not just the fallback's four. */
export function mergeTaxonomy(live: LiveTaxonomyRead): Taxonomy {
  const liveByDocType = live.rejectionReasonsByDocType
  const docTypes = new Set([...Object.keys(FALLBACK_TAXONOMY.rejectionReasonsByDocType), ...Object.keys(liveByDocType ?? {})])

  const rejectionReasonsByDocType: Record<string, string[]> = {}
  const rejectionReasonByDocType: Record<string, TaxonomyFieldSource> = {}
  for (const docType of docTypes) {
    const liveList = liveByDocType?.[docType]
    rejectionReasonsByDocType[docType] = liveList?.length ? liveList : (FALLBACK_TAXONOMY.rejectionReasonsByDocType[docType] ?? [])
    rejectionReasonByDocType[docType] = liveList?.length ? 'sheet' : 'fallback'
  }

  return {
    category: (live.category?.length ? live.category : FALLBACK_TAXONOMY.category) as Taxonomy['category'],
    rejectionReasonsByDocType,
    fraudReasons: live.fraudReasons?.length ? live.fraudReasons : FALLBACK_TAXONOMY.fraudReasons,
    reclassifyOptions: live.reclassifyOptions?.length ? live.reclassifyOptions : FALLBACK_TAXONOMY.reclassifyOptions,
    source: {
      category: live.category?.length ? 'sheet' : 'fallback',
      rejectionReasonByDocType,
      fraudReasons: live.fraudReasons?.length ? 'sheet' : 'fallback',
      reclassifyOptions: live.reclassifyOptions?.length ? 'sheet' : 'fallback',
    },
  }
}

// --- Session-scoped cache for the live taxonomy read -----------------------
// Category, Fraud Reason, Reclassify, and Rejection-Reason-by-doc-type are
// already read from the sheet only once per sign-in (the effect that calls
// readLiveTaxonomy in usePortal.ts depends only on `user`, never re-fires on
// a document/date-tab switch) — this doesn't change that, it only survives
// a page REFRESH within the same browser tab, which throws the in-memory
// state away and would otherwise force a full re-read. sessionStorage is a
// deliberate fit, not just a convenient API: it's cleared when the tab
// closes, which is exactly "per session" and nothing longer — no risk of a
// reviewer opening the portal tomorrow and silently working off yesterday's
// rejection-reason list.
//
// Company Category is NOT part of this cache and never will be — it's read
// per-document, live, off that specific OCR tab's own cell (see
// ocrParser.ts `attachFieldValidation`), a completely separate code path.
const TAXONOMY_CACHE_KEY = 'hitl-taxonomy-cache-v1'

export function loadCachedTaxonomy(): LiveTaxonomyRead | null {
  try {
    const raw = sessionStorage.getItem(TAXONOMY_CACHE_KEY)
    return raw ? (JSON.parse(raw) as LiveTaxonomyRead) : null
  } catch {
    // Private-browsing storage block, corrupt JSON, quota — any of these
    // just means "no cache", never a hard failure; the caller falls back
    // to a live read same as a first-ever visit.
    return null
  }
}

export function saveCachedTaxonomy(live: LiveTaxonomyRead): void {
  try {
    sessionStorage.setItem(TAXONOMY_CACHE_KEY, JSON.stringify(live))
  } catch {
    // Storage full/blocked — fine to just skip caching this time.
  }
}

// Category (Valid/Invalid/Incomplete) and Status (Approved/Rejected) used
// to be coupled here via a derived mapping. Per explicit correction: they
// are independent — a Valid document can still be Rejected for other
// reasons, and neither is derived from the other. Both are now set
// directly on DecisionDraft (see types.ts) with no auto-derivation.
