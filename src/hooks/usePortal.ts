import { useCallback, useEffect, useMemo, useState } from 'react'
import { CONFIG, DEMO_MODE } from '../lib/config'
import { extractDriveFileId, fetchDriveFileObjectUrl } from '../lib/driveApi'
import { getStoredUser, signIn, signOut, type AuthedUser } from '../lib/googleAuth'
import { MOCK_DATE_TABS, MOCK_MASTER_ROWS, MOCK_OCR_DOCS } from '../lib/mockData'
import { buildDecisionUpdates, fetchMasterRows, isDateTabTitle, readLiveTaxonomy, parseSheetUrlHref, type MasterRowsLoadProgress } from '../lib/masterSheet'
import { attachFieldValidation, buildFieldEdits, buildOcrCellUpdates, buildTableEdits, parseOcrRows } from '../lib/ocrParser'
import { batchUpdateValues, getGridData, listTabs } from '../lib/sheetsApi'
import { baseDocType, mergeTaxonomy } from '../lib/taxonomy'
import { isPendingStatus, masterRowKey, type CategoryValue, type DecisionDraft, type MasterRow, type OcrDocument, type OcrSection, type QueueFilters, type Taxonomy } from '../lib/types'

const EMPTY_DRAFT: DecisionDraft = { category: '', status: '', rejectionReason: '', fraudReason: [], reclassified: '', flags: '' }

function seedDraft(row: MasterRow): DecisionDraft {
  return {
    category: row.category,
    // A not-yet-decided row reads back as "In Progress" (the sheet's own
    // pre-review default, see isPendingStatus), not blank — normalize
    // that to '' here so the draft's own "has a decision been made?"
    // checks (Approve/Reject button highlighting, submit gating) don't
    // mistake the sheet's placeholder for an actual reviewer decision.
    status: isPendingStatus(row.status) ? '' : row.status,
    rejectionReason: row.rejectionReason,
    fraudReason: row.fraudReason,
    reclassified: row.reclassified,
    flags: row.flags,
  }
}


type SyncState = 'idle' | 'saving' | 'saved' | 'error'

export function usePortal() {
  const [user, setUser] = useState<AuthedUser | null>(DEMO_MODE ? { accessToken: 'demo', expiresAt: Infinity, name: 'Juan Dela Cruz', email: 'demo@hyperverge.co' } : getStoredUser())
  const [authError, setAuthError] = useState<string | null>(null)

  const [taxonomy, setTaxonomy] = useState<Taxonomy>(() => mergeTaxonomy({}))
  const [dateTabs, setDateTabs] = useState<string[]>(DEMO_MODE ? MOCK_DATE_TABS : [])
  const [masterRows, setMasterRows] = useState<MasterRow[]>(DEMO_MODE ? MOCK_MASTER_ROWS : [])
  const [loadingRows, setLoadingRows] = useState(false)
  /** Non-null while a date tab's rows are still streaming in past the
   * first batch (see `fetchMasterRows`) — lets the UI show "1500 / 3038"
   * instead of leaving the reviewer guessing whether it's still working. */
  const [rowsLoadProgress, setRowsLoadProgress] = useState<MasterRowsLoadProgress | null>(null)
  const [rowsError, setRowsError] = useState<string | null>(null)

  const [filters, setFilters] = useState<QueueFilters>({
    date: DEMO_MODE ? MOCK_DATE_TABS[0] : '',
    reviewer: 'All',
    status: 'Pending',
    apiCalled: 'all',
    documentType: 'All',
  })
  const [search, setSearch] = useState('')

  // Keyed by masterRowKey (Transaction ID + Request ID + Document Type),
  // not Request ID alone and not Transaction ID + Document Type alone —
  // see MasterRow.requestId's comment in types.ts for the two separate
  // live collisions that ruled each of those out.
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)
  const [currentDoc, setCurrentDoc] = useState<OcrDocument | null>(null)
  const [draftSections, setDraftSections] = useState<OcrSection[] | null>(null)
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>(EMPTY_DRAFT)
  const [loadingDoc, setLoadingDoc] = useState(false)

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imagePreviewType, setImagePreviewType] = useState<string | null>(null)
  const [imageLoadError, setImageLoadError] = useState<string | null>(null)

  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMessage, setSyncMessage] = useState<string | undefined>()

  // --- Sign in / out ---------------------------------------------------
  const doSignIn = useCallback(async () => {
    setAuthError(null)
    try {
      const authedUser = await signIn()
      setUser(authedUser)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed')
    }
  }, [])

  const doSignOut = useCallback(() => {
    signOut(user)
    setUser(null)
  }, [user])

  // --- Load tabs + taxonomy once signed in (real mode only) ------------
  useEffect(() => {
    if (DEMO_MODE || !user || !CONFIG.masterSheetId) return
    let cancelled = false
    ;(async () => {
      try {
        const tabs = await listTabs(CONFIG.masterSheetId!, user.accessToken)
        if (cancelled) return
        // Only date-named tabs ("03-09-2026") are a day's queue — other
        // tabs in the same spreadsheet (the "Ref" rejection-reason lookup,
        // the "Reviewers" notes tab, ...) must never show up as a date
        // option or get mistaken for the most recent one.
        const dateTitles = tabs
          .filter((t) => isDateTabTitle(t.title))
          .sort((a, b) => b.index - a.index)
          .map((t) => t.title)
        setDateTabs(dateTitles)
        setFilters((f) => ({ ...f, date: f.date || dateTitles[0] || '' }))
        const sampleTabTitle = dateTitles[0] ?? tabs[0]?.title
        if (sampleTabTitle) {
          const live = await readLiveTaxonomy(CONFIG.masterSheetId!, sampleTabTitle, tabs, user.accessToken)
          if (!cancelled) setTaxonomy(mergeTaxonomy(live))
        }
      } catch (err) {
        if (!cancelled) setRowsError(err instanceof Error ? err.message : 'Failed to load the master sheet')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  // --- Load master rows for the selected date tab (real mode only) -----
  // A production date tab has run into the thousands of rows (~3000
  // observed), so this streams in bounded batches (fetchMasterRows) rather
  // than requesting the whole tab in one shot — see its comments for why
  // that was crashing/hanging the browser. The queue becomes usable after
  // the first batch; loadingRows only covers that initial wait, while
  // rowsLoadProgress tracks the rest streaming in behind it.
  useEffect(() => {
    if (DEMO_MODE || !user || !CONFIG.masterSheetId || !filters.date) return
    let cancelled = false
    setLoadingRows(true)
    setRowsError(null)
    setRowsLoadProgress(null)
    setMasterRows([])
    ;(async () => {
      let firstBatch = true
      try {
        await fetchMasterRows(
          CONFIG.masterSheetId!,
          filters.date,
          user.accessToken,
          (rows, progress) => {
            if (cancelled) return
            setMasterRows((prev) => [...prev, ...rows])
            setRowsLoadProgress(progress.loaded < progress.total ? progress : null)
            if (firstBatch) {
              setLoadingRows(false)
              firstBatch = false
            }
          },
          () => !cancelled,
        )
      } catch (err) {
        if (!cancelled) setRowsError(err instanceof Error ? err.message : 'Failed to load documents for this date')
      } finally {
        if (!cancelled) {
          setLoadingRows(false)
          setRowsLoadProgress(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, filters.date])

  // --- Derived: filtered queue ------------------------------------------
  const filteredRows = useMemo(() => {
    return masterRows.filter((row) => {
      if (filters.reviewer !== 'All' && row.reviewer !== filters.reviewer) return false
      if (filters.status === 'Pending' && !isPendingStatus(row.status)) return false
      if (filters.status !== 'All' && filters.status !== 'Pending' && row.status !== filters.status) return false
      if (filters.apiCalled === 'done' && row.apiCalled !== 'Done') return false
      if (filters.apiCalled === 'not_done' && row.apiCalled === 'Done') return false
      if (filters.documentType !== 'All' && baseDocType(row.documentType) !== filters.documentType) return false
      if (search.trim() && !row.transactionId.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
  }, [masterRows, filters, search])

  const reviewers = useMemo(() => Array.from(new Set(masterRows.map((r) => r.reviewer).filter(Boolean))).sort(), [masterRows])
  const docTypes = useMemo(() => Array.from(new Set(masterRows.map((r) => baseDocType(r.documentType)).filter(Boolean))).sort(), [masterRows])
  const pendingCount = useMemo(() => masterRows.filter((r) => isPendingStatus(r.status)).length, [masterRows])

  // Default selection: first row of the filtered queue, whenever nothing
  // (or a since-filtered-out row) is selected. Every row — every
  // masterRowKey (Transaction ID + Request ID + Document Type) — is its
  // own independent queue card, opened and submitted on its own,
  // regardless of what it shares with another row on any one or two of
  // those three fields; the queue list is the only way to move between
  // them.
  //
  // Deliberately depends on `filteredRows` only, not `selectedRowKey`,
  // using the functional setState form to read the current selection
  // without needing it as a dependency — so this only re-validates when
  // the *available queue itself* changes (filters, search, or the loaded
  // rows), not merely because the selection changed.
  useEffect(() => {
    setSelectedRowKey((current) => {
      if (current && filteredRows.some((r) => masterRowKey(r) === current)) return current
      return filteredRows[0] ? masterRowKey(filteredRows[0]) : null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows])

  const selectedRow = useMemo(() => masterRows.find((r) => masterRowKey(r) === selectedRowKey) ?? null, [masterRows, selectedRowKey])

  // --- Load the OCR document for whichever row is selected --------------
  // masterRowKey (Transaction ID + Request ID + Document Type) is the
  // only safe key here — see OcrDocument.rowKey's comment in types.ts.
  // Two rows can share a Request ID, or share a Transaction ID *and*
  // Document Type (found live — real data, not a hypothetical, in both
  // cases), so `currentDoc`/`draftSections` are cleared synchronously the
  // instant `selectedRow` changes, before the async fetch even starts: there must
  // be no window where the OLD document's data is still sitting there
  // labeled as if it belongs to the newly-selected row. `loadingDoc`
  // gates the UI (App.tsx shows a loading placeholder instead of stale
  // content), and submit() has its own independent rowKey check as a
  // second guard against a race where Submit gets clicked before this
  // fetch has caught up.
  useEffect(() => {
    setCurrentDoc(null)
    setDraftSections(null)

    if (!selectedRow) {
      setDecisionDraft(EMPTY_DRAFT)
      return
    }
    setDecisionDraft(seedDraft(selectedRow))
    const rowKey = masterRowKey(selectedRow)

    if (DEMO_MODE) {
      const doc = MOCK_OCR_DOCS[rowKey] ?? null
      setCurrentDoc(doc)
      setDraftSections(doc ? structuredClone(doc.sections) : null)
      return
    }

    if (!user) return
    let cancelled = false
    setLoadingDoc(true)
    ;(async () => {
      try {
        const parsedUrl = parseSheetUrlHref(selectedRow.sheetUrl.href)
        if (!parsedUrl) throw new Error('Could not resolve the OCR sheet link for this row — see README known gaps.')
        const quotedTab = `'${selectedRow.documentType.replace(/'/g, "''")}'`
        // getGridData, not the lighter getValues — needed for per-cell
        // dataValidation so a field like Company Category can offer live
        // suggestions (see attachFieldValidation). OCR tabs are small
        // (a few dozen rows), so this doesn't carry the cost that made
        // the master sheet's row list switch away from it.
        const grid = await getGridData(parsedUrl.spreadsheetId, `${quotedTab}!A1:D500`, user.accessToken)
        if (cancelled) return
        const rows = grid.map((row) => row.map((cell) => cell?.formattedValue ?? ''))
        const parsedDoc = parseOcrRows(rows)
        const sections = await attachFieldValidation(parsedDoc.sections, grid, parsedUrl.spreadsheetId, user.accessToken)
        if (cancelled) return
        const doc: OcrDocument = { rowKey, spreadsheetId: parsedUrl.spreadsheetId, tabTitle: selectedRow.documentType, gid: parsedUrl.gid, ...parsedDoc, sections }
        setCurrentDoc(doc)
        setDraftSections(structuredClone(doc.sections))
      } catch (err) {
        if (!cancelled) {
          setCurrentDoc(null)
          setDraftSections(null)
          setSyncMessage(err instanceof Error ? err.message : 'Failed to load this document')
          setSyncState('error')
        }
      } finally {
        if (!cancelled) setLoadingDoc(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow && masterRowKey(selectedRow), user])

  // --- Resolve the document image -----------------------------------------
  // The actual document file lives behind the "Drive Link" column, not
  // "Image URL" (confirmed by the user — Image URL isn't the one to use
  // here, whatever it's actually for). Drive Link resolves to a Drive
  // *view* link — opens fine as a normal navigation, which is what the
  // "Open in Drive" button uses directly — but that URL serves an HTML
  // viewer page, not raw image bytes, so it can't be dropped straight into
  // an <img src>. For the inline preview we pull the file id out of that
  // same link and fetch the actual bytes through the Drive API with the
  // reviewer's own token, then hand the browser a blob: URL. Demo mode
  // never has a real link here, so this is a no-op there (ImageViewer's
  // placeholder covers it).
  useEffect(() => {
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImagePreviewType(null)
    setImageLoadError(null)

    if (DEMO_MODE || !user || !selectedRow) return

    const fileId = extractDriveFileId(selectedRow.driveLink.href)
    if (!fileId) {
      setImageLoadError('Could not find a Drive file id in the Drive Link for this row.')
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    ;(async () => {
      try {
        const preview = await fetchDriveFileObjectUrl(fileId, user.accessToken)
        if (cancelled) {
          URL.revokeObjectURL(preview.url)
        } else {
          objectUrl = preview.url
          setImagePreviewUrl(preview.url)
          setImagePreviewType(preview.mimeType)
        }
      } catch (err) {
        if (!cancelled) setImageLoadError(err instanceof Error ? err.message : 'Failed to load the document image')
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // masterRowKey, not requestId — two rows can share a Request ID
    // (see MasterRow.requestId's comment), which would otherwise make
    // this effect not re-run at all when switching between them, leaving
    // the first row's image showing under the second row's selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow && masterRowKey(selectedRow), user])

  // --- OCR field/table edit handlers ------------------------------------
  const editField = useCallback((sectionIndex: number, fieldIndex: number, value: string) => {
    setDraftSections((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      const section = next[sectionIndex]
      if (section.kind === 'fields') section.fields[fieldIndex].value = value
      return next
    })
  }, [])

  const editTableCell = useCallback((sectionIndex: number, rowIndex: number, colIndex: number, value: string) => {
    setDraftSections((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      const section = next[sectionIndex]
      if (section.kind === 'table') {
        const row = section.rows.find((r) => r.rowIndex === rowIndex)
        if (row) row.cells[colIndex] = value
      }
      return next
    })
  }, [])

  const addTableRow = useCallback((sectionIndex: number) => {
    setDraftSections((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      const section = next[sectionIndex]
      if (section.kind === 'table') {
        const nextSyntheticIndex = Math.min(0, ...section.rows.map((r) => r.rowIndex)) - 1
        section.rows.push({ rowIndex: nextSyntheticIndex, cells: section.columns.map(() => '') })
      }
      return next
    })
  }, [])

  const removeTableRow = useCallback((sectionIndex: number, rowIndex: number) => {
    setDraftSections((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      const section = next[sectionIndex]
      if (section.kind === 'table') section.rows = section.rows.filter((r) => r.rowIndex !== rowIndex)
      return next
    })
  }, [])

  // --- Submit -------------------------------------------------------------
  const submit = useCallback(async () => {
    // Category and Status are independent — see DecisionDraft's comments —
    // so both must be explicitly set; neither is derived from the other.
    if (!selectedRow || decisionDraft.category === '' || decisionDraft.status === '') return
    // Defense in depth against the OCR-doc-loading race (the OCR-load
    // effect clears currentDoc synchronously on every selection change,
    // so this should be unreachable in practice — but if the fetch for
    // the currently selected row hasn't caught up yet, or currentDoc
    // somehow still belongs to a previous selection, refuse to submit
    // rather than risk writing the OCR edits into the wrong document's
    // tab. masterRowKey is the only thing that can answer "does this OCR
    // data actually belong to this row?" — see OcrDocument.rowKey. A
    // currentDoc that's simply null (the read genuinely failed) is fine
    // to proceed past — that's an intentional decision-only submit.
    const selectedKey = masterRowKey(selectedRow)
    if (loadingDoc || (currentDoc !== null && currentDoc.rowKey !== selectedKey)) {
      setSyncState('error')
      setSyncMessage('Still loading this document — try Submit again in a moment.')
      return
    }
    const category: CategoryValue = decisionDraft.category
    const decision = {
      category,
      rejectionReason: decisionDraft.rejectionReason,
      status: decisionDraft.status,
      fraudReason: decisionDraft.fraudReason,
      reclassified: decisionDraft.reclassified,
      flags: decisionDraft.flags,
    }

    setSyncState('saving')
    // Keyed by masterRowKey, not requestId: two rows can share a Request
    // ID, and matching on it here would have updated *both* rows' local
    // state from one submit (the actual sheet write below was always
    // fine — it targets rowIndex, the row's real physical position — but
    // this in-app mirror of it was not).
    const oldFilteredOrder = filteredRows.map((r) => masterRowKey(r))
    const submittedRowKey = selectedKey

    try {
      if (!DEMO_MODE) {
        if (!user || !CONFIG.masterSheetId) throw new Error('Not signed in')
        const masterUpdates = buildDecisionUpdates(filters.date, selectedRow.rowIndex, decision)
        await batchUpdateValues(CONFIG.masterSheetId, masterUpdates, user.accessToken)

        if (currentDoc && draftSections) {
          const fieldEdits = buildFieldEdits(currentDoc.sections, draftSections)
          const tableEdits = buildTableEdits(draftSections)
          const ocrUpdates = buildOcrCellUpdates(currentDoc.tabTitle, fieldEdits, tableEdits)
          if (ocrUpdates.length > 0) await batchUpdateValues(currentDoc.spreadsheetId, ocrUpdates, user.accessToken)
        }
      }

      // Reflect the decision locally either way (demo mode's only
      // persistence, and in real mode so the UI doesn't wait on a re-fetch).
      setMasterRows((prev) => prev.map((r) => (masterRowKey(r) === submittedRowKey ? { ...r, ...decision } : r)))
      setSyncState('saved')
      setSyncMessage(undefined)

      const idx = oldFilteredOrder.indexOf(submittedRowKey)
      const nextKey = oldFilteredOrder[idx + 1] ?? null
      setSelectedRowKey(nextKey)
    } catch (err) {
      setSyncState('error')
      setSyncMessage(err instanceof Error ? err.message : 'Save failed')
    }
  }, [selectedRow, decisionDraft, filters.date, currentDoc, draftSections, filteredRows, user, loadingDoc])

  return {
    demoMode: DEMO_MODE,
    user,
    authError,
    doSignIn,
    doSignOut,

    taxonomy,
    dateTabs,
    reviewers,
    docTypes,
    filters,
    setFilters,
    search,
    setSearch,

    masterRows,
    filteredRows,
    loadingRows,
    rowsLoadProgress,
    rowsError,
    pendingCount,

    selectedRow,
    selectedRowKey,
    setSelectedRowKey,
    currentDoc,
    draftSections,
    loadingDoc,
    imagePreviewUrl,
    imagePreviewType,
    imageLoadError,
    decisionDraft,
    setDecisionDraft,
    editField,
    editTableCell,
    addTableRow,
    removeTableRow,

    submit,
    syncState,
    syncMessage,
  }
}
