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

  source: 'fallback',
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
   * for a single column's dropdown to vary by row. We use it as a
   * cross-check: intersect it with the hardcoded per-doc-type fallback
   * list so the portal only ever offers a reason that is BOTH relevant to
   * that document type AND currently valid per the live sheet. */
  rejectionReasonsFlat?: string[] | null
  fraudReasons?: string[] | null
  reclassifyOptions?: string[] | null
}

/** Combine a live read of the sheet's own data-validation rules with the
 * hardcoded fallback above. Never returns an empty list for a document
 * type that has fallback entries — if a live list exists but doesn't
 * overlap at all with the fallback for some doc type (e.g. the rule
 * changed shape), that's more likely a bug in this intersection than a
 * real "zero valid reasons" situation, so we fall back to the full
 * hardcoded list for that doc type rather than leave reviewers stuck. */
export function mergeTaxonomy(live: LiveTaxonomyRead): Taxonomy {
  const anyLive = Boolean(live.category?.length || live.rejectionReasonsFlat?.length || live.fraudReasons?.length || live.reclassifyOptions?.length)

  const rejectionReasonsByDocType: Record<string, string[]> = {}
  for (const [docType, fallbackReasons] of Object.entries(FALLBACK_TAXONOMY.rejectionReasonsByDocType)) {
    if (live.rejectionReasonsFlat?.length) {
      const liveSet = new Set(live.rejectionReasonsFlat)
      const intersected = fallbackReasons.filter((r) => liveSet.has(r))
      rejectionReasonsByDocType[docType] = intersected.length > 0 ? intersected : fallbackReasons
    } else {
      rejectionReasonsByDocType[docType] = fallbackReasons
    }
  }

  return {
    category: (live.category?.length ? live.category : FALLBACK_TAXONOMY.category) as Taxonomy['category'],
    rejectionReasonsByDocType,
    fraudReasons: live.fraudReasons?.length ? live.fraudReasons : FALLBACK_TAXONOMY.fraudReasons,
    reclassifyOptions: live.reclassifyOptions?.length ? live.reclassifyOptions : FALLBACK_TAXONOMY.reclassifyOptions,
    source: anyLive ? 'sheet' : 'fallback',
  }
}

// Category (Valid/Invalid/Incomplete) and Status (Approved/Rejected) used
// to be coupled here via a derived mapping. Per explicit correction: they
// are independent — a Valid document can still be Rejected for other
// reasons, and neither is derived from the other. Both are now set
// directly on DecisionDraft (see types.ts) with no auto-derivation.
