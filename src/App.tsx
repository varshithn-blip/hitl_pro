import { DecisionPanel } from './components/DecisionPanel'
import { FilterBar } from './components/FilterBar'
import { ImageViewer } from './components/ImageViewer'
import { OcrEditor } from './components/OcrEditor'
import { QueueList } from './components/QueueList'
import { SignInGate } from './components/SignInGate'
import { StatusFooter } from './components/StatusFooter'
import { TopBar } from './components/TopBar'
import { TransactionSummary } from './components/TransactionSummary'
import { usePortal } from './hooks/usePortal'

export default function App() {
  const p = usePortal()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar user={p.user} demoMode={p.demoMode} onSignIn={p.doSignIn} onSignOut={p.doSignOut} />

      {!p.user ? (
        <SignInGate onSignIn={p.doSignIn} error={p.authError} />
      ) : (
        <>
          <FilterBar
            dateTabs={p.dateTabs}
            reviewers={p.reviewers}
            filters={p.filters}
            onChange={p.setFilters}
            queueCount={p.filteredRows.length}
            pendingCount={p.pendingCount}
            search={p.search}
            onSearchChange={p.setSearch}
          />

          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <QueueList rows={p.filteredRows} selectedRequestId={p.selectedRow?.requestId ?? null} onSelect={p.setSelectedRequestId} />

            {p.rowsError ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', fontSize: 13 }}>{p.rowsError}</div>
            ) : !p.selectedRow ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {p.loadingRows ? 'Loading…' : 'All caught up — nothing matches these filters.'}
              </div>
            ) : (
              <>
                <ImageViewer row={p.selectedRow} siblingDocs={p.siblingDocs} onSelectSibling={p.setSelectedRequestId} />

                <div style={{ width: 452, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden' }}>
                  <TransactionSummary row={p.selectedRow} />

                  {p.loadingDoc || !p.draftSections ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                      {p.loadingDoc ? 'Loading OCR values…' : 'No OCR data found for this document.'}
                    </div>
                  ) : (
                    <OcrEditor
                      sections={p.draftSections}
                      onFieldChange={p.editField}
                      onTableCellChange={p.editTableCell}
                      onAddTableRow={p.addTableRow}
                      onRemoveTableRow={p.removeTableRow}
                    />
                  )}

                  <DecisionPanel
                    taxonomy={p.taxonomy}
                    documentType={p.selectedRow.documentType}
                    draft={p.decisionDraft}
                    onChange={p.setDecisionDraft}
                    onSubmit={p.submit}
                    submitting={p.syncState === 'saving'}
                  />
                </div>
              </>
            )}
          </div>

          <StatusFooter queueCount={p.masterRows.length} pendingCount={p.pendingCount} syncState={p.syncState} syncMessage={p.syncState === 'error' ? p.syncMessage : undefined} />
        </>
      )}
    </div>
  )
}
