import { parseOcrRows } from './ocrParser'
import type { MasterRow, OcrDocument } from './types'

// Synthetic demo-mode fixtures. Field STRUCTURE (labels, section grouping,
// the coe_0 repeating table) mirrors the real OCR sheets pulled during
// discovery; every ID, name, address and amount below is fictional — none
// of this is real transaction data. These OCR row fixtures are also what
// exercises ocrParser.ts's section-boundary heuristics against realistic,
// truncated-row input (see the "Sheets truncates trailing empty cells"
// note in ocrParser.ts) — see scripts/verify-parser.mjs.

export const MOCK_DATE_TABS = ['07 Sep 2026', '06 Sep 2026']

export const MOCK_REVIEWERS = ['Juan Dela Cruz', 'Maria Ramos', 'Roland Lim']

function row(...cells: (string | undefined)[]): string[] {
  // Emulate Sheets API truncation: drop trailing empty/undefined cells.
  let end = cells.length
  while (end > 0 && !cells[end - 1]) end--
  return cells.slice(0, end) as string[]
}

const LOAN_0_ROWS: string[][] = [
  row('HyperVergeTransaction ID', 'ETB-2029-4471'),
  row('Customer ID', 'rgitid'),
  row('Error'),
  [],
  row('Fields', 'Values'),
  row('Customer Name', 'Maria Santos Reyes'),
  row('Customer Address', '44 Rizal Ave, Quezon City'),
  row('Customer ZipCode', '1100'),
  row('Bank Name', 'BDO Unibank'),
  row('Account Number', '0012-3456-7890'),
  row('Loan Details'),
  row('Fields', 'Values'),
  row('Statement Date', '05'),
  row('Statement Month', '08'),
  row('Statement Year', '2026'),
  row('Avail Date', '12/01/2024'),
  row('Loan Type', 'Personal Loan'),
  row('Total Loan Amount', '250000'),
  row('Interest Rate Percentage', '1.75'),
  row('Interest Rate Time Period', 'Monthly'),
  row('Loan Tenure (Months)', '36'),
  row('Currency', 'PHP'),
  row('EMI Amount', '9125.50'),
  row('Outstanding Balance', '182000'),
  row('Overdue Amount'),
  row('Penalty Amount'),
]

const PAYSLIP_0_ROWS: string[][] = [
  row('HyperVergeTransaction ID', 'NTB-8814-2093'),
  row('Customer ID', 'rgitid'),
  row('Error'),
  [],
  row('Fields', 'Values'),
  row('Salary Period Start Date', '01/08/2026'),
  row('Salary Period End Date', '15/08/2026'),
  row('Pay Date'),
  row('Duration', '15'),
  row('Coverage Period', 'S'),
  row('Employee Name', 'Ronaldo B. Mijares'),
  row('Employer Name', 'GEBS Corp'),
  row('Company Category', 'No Match | NA | 0'),
  row('Employee ID', '1921-010'),
  row('Employee Designation', "Business Dev't & IT Head"),
  row('SSS Number'),
  row('TIN Number'),
  row('PhilHealth Number'),
  row('Tax Status'),
  row('Salary Details'),
  row('Fields', 'Values'),
  row('Currency', 'PHP'),
  row('Basic Pay', '30000'),
  row('Variable Pay'),
  row('Gross Salary', '41540.66'),
  row('SSS Premium'),
  row('PhilHealth Premium', '1500'),
  row('Net Salary', '40048.66'),
]

const CREDIT_0_ROWS: string[][] = [
  row('HyperVergeTransaction ID', 'NTB-1145-9902'),
  row('Customer ID', 'rgitid'),
  row('Error'),
  [],
  row('Fields', 'Values', 'Flags'),
  row('Customer Name', 'Jomel Ramos Julaton', 'Customer Name ok'),
  row('Customer Address', '200 Purok 3 Alva St, San Ildefonso Bulacan', 'Customer Address ok'),
  row('Customer ZipCode', '3010', 'Customer ZipCode ok'),
  row('Bank Name', 'BPI', 'Bank Name ok'),
  row('Account Number'),
  row('Credit Card Details'),
  row('Fields', 'Values', 'Flags'),
  row('Statement Date', '09', 'Statement date ok'),
  row('Statement Month', '08', 'Statement Month ok'),
  row('Statement Year', '2026', 'Statement Year ok'),
  row('Credit Limit', '52000', 'Credit Limit must have 2 decimal places'),
  row('Interest Rate', '', 'Interest Rate missing or invalid'),
  row('Currency', 'PHP', 'Currency is missing'),
  row('Total Amount Due', '9888.20', 'Total Amount Due must have 2 decimal places'),
  row('Cash Advance Limit', '', 'Cash Advance Limit must have 2 decimal places'),
  row('Minimum due amount', '850', 'Minimum due amount ok'),
  row('Payment Or Credit Amount', '9311', 'Payment Or Credit Amount must have 2 decimal places'),
  row('Overdue Amount', '', 'Overdue Amount must have 2 decimal places'),
  row('Penalty Amount', '', 'Penalty Amount must have 2 decimal places'),
  row('Due Date', '31/08/2026', 'Due Date ok'),
  row('Reward Amount', '', 'Reward Amount must have 2 decimal places'),
]

const COE_0_ROWS: string[][] = [
  row('HyperVergeTransaction ID', 'ETB-2029-4471'),
  row('Customer ID', 'rgitid'),
  row('Error'),
  [],
  row('Fields', 'Values'),
  row('Employee Name', 'Julian Paolo E. Caraballe'),
  row('Employer Name', 'San Carlos Sun Power Inc'),
  row('Company Category', 'San Carlos Sun Power Inc | Cat B | 1'),
  row('Employee Designation', 'IT Network Administrator'),
  row('Employment Start Date', '02/08/2024'),
  row('Document Issued Date', '17/07/2026'),
  row('Coverage Period', 'M'),
  row('Status of Employment', 'Present'),
  row('Currency', 'PHP'),
  row('Total Salary Amount', '32896'),
  row('Total Salary Frequency', 'Monthly'),
  row('Salary Components'),
  row('Component Name', 'Amount', 'Frequency'),
  row('Basic Pay', '32896', 'Monthly'),
  row('Housing Allowance', '4500', 'Monthly'),
]

function toOcrDocument(spreadsheetId: string, tabTitle: string, gid: number, rows: string[][]): OcrDocument {
  return { spreadsheetId, tabTitle, gid, ...parseOcrRows(rows) }
}

/** Keyed by `${transactionId}::${documentType}` — how App.tsx looks up
 * which OCR tab belongs to a given master-sheet row. */
export const MOCK_OCR_DOCS: Record<string, OcrDocument> = {
  'ETB-2029-4471::coe_0': toOcrDocument('mock-sheet-1', 'coe_0', 1001, COE_0_ROWS),
  'ETB-2029-4471::loan_0': toOcrDocument('mock-sheet-1', 'loan_0', 1002, LOAN_0_ROWS),
  'NTB-8814-2093::payslip_0': toOcrDocument('mock-sheet-2', 'payslip_0', 2001, PAYSLIP_0_ROWS),
  'ETB-3357-6620::loan_0': toOcrDocument('mock-sheet-3', 'loan_0', 3001, LOAN_0_ROWS),
  'NTB-1145-9902::credit_0': toOcrDocument('mock-sheet-4', 'credit_0', 4001, CREDIT_0_ROWS),
  'ETB-7702-3384::loan_0': toOcrDocument('mock-sheet-5', 'loan_0', 5001, LOAN_0_ROWS),
  'NTB-5561-0037::payslip_0': toOcrDocument('mock-sheet-6', 'payslip_0', 6001, PAYSLIP_0_ROWS),
}

function linkCell(label: string): { label: string; href: string | null } {
  // Demo mode never resolves real hyperlinks — see README "Known gaps".
  return { label, href: null }
}

export const MOCK_MASTER_ROWS: MasterRow[] = [
  {
    rowIndex: 2,
    appId: 'rgitid',
    transactionId: 'ETB-2029-4471',
    requestId: '5f84b481-51f0-4d3a-8dd2-11f54c20db1b',
    imageUrl: linkCell('File Link'),
    documentType: 'coe_0',
    sheetUrl: linkCell('mock-sheet-1'),
    category: '',
    rejectionReason: '',
    status: '',
    fraudReason: [],
    reviewer: 'Juan Dela Cruz',
    apiCalled: '',
    driveLink: linkCell('Drive Link'),
    flags: '',
    reclassified: '',
    processed: '',
  },
  {
    rowIndex: 3,
    appId: 'rgitid',
    transactionId: 'ETB-2029-4471',
    requestId: 'a1b7c9d0-1111-4a2b-9c3d-4e5f60718293',
    imageUrl: linkCell('File Link'),
    documentType: 'loan_0',
    sheetUrl: linkCell('mock-sheet-1'),
    category: '',
    rejectionReason: '',
    // The real prod sheet pre-fills Status with "In Progress" rather than
    // leaving it blank on an unreviewed row (see isPendingStatus) — one
    // fixture uses that exact convention so demo mode exercises it too,
    // instead of only ever testing the plain-blank case.
    status: 'In Progress',
    fraudReason: [],
    reviewer: 'Juan Dela Cruz',
    apiCalled: 'Done',
    driveLink: linkCell('Drive Link'),
    flags: '',
    reclassified: '',
    processed: '',
  },
  {
    rowIndex: 4,
    appId: 'rgitid',
    transactionId: 'NTB-8814-2093',
    requestId: '1b80bc3f-c0b5-4631-b1d1-cc1dc0f9f660',
    imageUrl: linkCell('File Link'),
    documentType: 'payslip_0',
    sheetUrl: linkCell('mock-sheet-2'),
    category: '',
    rejectionReason: '',
    status: '',
    fraudReason: [],
    reviewer: 'Maria Ramos',
    apiCalled: '',
    driveLink: linkCell('Drive Link'),
    flags: '',
    reclassified: '',
    processed: '',
  },
  {
    rowIndex: 5,
    appId: 'rgitid',
    transactionId: 'ETB-3357-6620',
    requestId: 'f6389128-9d36-4fc8-bd2d-55d700d3d347',
    imageUrl: linkCell('File Link'),
    documentType: 'loan_0',
    sheetUrl: linkCell('mock-sheet-3'),
    category: '',
    rejectionReason: '',
    status: '',
    fraudReason: [],
    reviewer: 'Juan Dela Cruz',
    apiCalled: '',
    driveLink: linkCell('Drive Link'),
    flags: '',
    reclassified: '',
    processed: '',
  },
  {
    rowIndex: 6,
    appId: 'rgitid',
    transactionId: 'NTB-1145-9902',
    requestId: 'b68bbf95-48fd-49de-a92a-558d48f072f3',
    imageUrl: linkCell('File Link'),
    documentType: 'credit_0',
    sheetUrl: linkCell('mock-sheet-4'),
    category: 'Invalid',
    rejectionReason: 'Credit Limit Value Missing',
    status: 'Manually Rejected',
    fraudReason: ['Company Absent in Category List'],
    reviewer: 'Maria Ramos',
    apiCalled: 'Done',
    driveLink: linkCell('Drive Link'),
    flags: '',
    reclassified: '',
    processed: '',
  },
  {
    rowIndex: 7,
    appId: 'rgitid',
    transactionId: 'ETB-7702-3384',
    requestId: '832dfff1-7d80-4986-a769-2443a106d79c',
    imageUrl: linkCell('File Link'),
    documentType: 'loan_0',
    sheetUrl: linkCell('mock-sheet-5'),
    category: 'Incomplete',
    rejectionReason: 'Interest Rate Missing',
    status: 'Manually Rejected',
    fraudReason: [],
    reviewer: 'Roland Lim',
    apiCalled: '',
    driveLink: linkCell('Drive Link'),
    flags: '',
    reclassified: '',
    processed: '',
  },
  {
    rowIndex: 8,
    appId: 'rgitid',
    transactionId: 'NTB-5561-0037',
    requestId: '7c1fd6e5-1368-4fa1-b9e9-9fdaf45c567a',
    imageUrl: linkCell('File Link'),
    documentType: 'payslip_0',
    sheetUrl: linkCell('mock-sheet-6'),
    category: 'Valid',
    rejectionReason: '',
    status: 'Manually Approved',
    fraudReason: [],
    reviewer: 'Juan Dela Cruz',
    apiCalled: 'Done',
    driveLink: linkCell('Drive Link'),
    flags: '',
    reclassified: '',
    processed: '',
  },
]
