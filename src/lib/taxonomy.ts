import type { Taxonomy } from './types'

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

  source: { category: 'fallback', rejectionReason: 'fallback', fraudReasons: 'fallback', reclassifyOptions: 'fallback' },
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
  /** The master sheet has ONE Rejection Reason column shared by every
   * document type, so its data-validation rule (if any) is necessarily a
   * single flat list covering all document types at once — there's no way
   * for a single column's dropdown to vary by row/doc-type. */
  rejectionReasonsFlat?: string[] | null
  fraudReasons?: string[] | null
  reclassifyOptions?: string[] | null
}

/** Combine a live read of the sheet's own data-validation rules with the
 * hardcoded fallback above.
 *
 * IMPORTANT, and previously wrong here: when a live rejection-reasons list
 * IS read, it is used AS-IS — the same full list for every document type
 * — not intersected against the hardcoded per-doc-type breakdown. An
 * earlier version of this function did intersect the two ("only offer a
 * reason that's both relevant to this doc type per my guess AND in the
 * live list"), which sounds like a reasonable safety cross-check but
 * actually does the opposite of what was asked: any reason the live sheet
 * has that isn't already in the hardcoded list gets silently dropped, so
 * the dropdown looked "live" but was quietly capped at whatever this file
 * already knew about — exactly the "still don't see the complete list"
 * symptom. The sheet's column has no per-doc-type grouping to preserve in
 * the first place, so mirroring it verbatim (per the explicit ask to
 * "always use the existing dropdown... to populate the dropdown") is both
 * the correct behavior and the simpler one. The hardcoded per-doc-type
 * breakdown is now used ONLY as the fallback when live reading fails
 * entirely for that field. */
export function mergeTaxonomy(live: LiveTaxonomyRead): Taxonomy {
  const rejectionReasonsByDocType: Record<string, string[]> = {}
  for (const docType of Object.keys(FALLBACK_TAXONOMY.rejectionReasonsByDocType)) {
    rejectionReasonsByDocType[docType] = live.rejectionReasonsFlat?.length ? live.rejectionReasonsFlat : FALLBACK_TAXONOMY.rejectionReasonsByDocType[docType]
  }

  return {
    category: (live.category?.length ? live.category : FALLBACK_TAXONOMY.category) as Taxonomy['category'],
    rejectionReasonsByDocType,
    fraudReasons: live.fraudReasons?.length ? live.fraudReasons : FALLBACK_TAXONOMY.fraudReasons,
    reclassifyOptions: live.reclassifyOptions?.length ? live.reclassifyOptions : FALLBACK_TAXONOMY.reclassifyOptions,
    source: {
      category: live.category?.length ? 'sheet' : 'fallback',
      rejectionReason: live.rejectionReasonsFlat?.length ? 'sheet' : 'fallback',
      fraudReasons: live.fraudReasons?.length ? 'sheet' : 'fallback',
      reclassifyOptions: live.reclassifyOptions?.length ? 'sheet' : 'fallback',
    },
  }
}

// Category (Valid/Invalid/Incomplete) and Status (Approved/Rejected) used
// to be coupled here via a derived mapping. Per explicit correction: they
// are independent — a Valid document can still be Rejected for other
// reasons, and neither is derived from the other. Both are now set
// directly on DecisionDraft (see types.ts) with no auto-derivation.
