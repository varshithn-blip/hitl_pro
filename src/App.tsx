import { useEffect, useState } from 'react'
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

type RightTab = 'ocr' | 'decision'

export default function App() {
  const p = usePortal()
  const [rightTab, setRightTab] = useState<RightTab>('ocr')

  // Always land on the OCR tab first when opening a different document —
  // reviewing fields comes before deciding, and it avoids carrying the
  // previous document's tab choice over by accident.
  useEffect(() => {
    setRightTab('ocr')
  }, [p.selectedRowKey])

  const decisionStarted = p.decisionDraft.category !== '' || p.decisionDraft.status !== ''

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
            docTypes={p.docTypes}
            filters={p.filters}
            onChange={p.setFilters}
            queueCount={p.filteredRows.length}
            pendingCount={p.pendingCount}
            search={p.search}
            onSearchChange={p.setSearch}
          />

          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <QueueList rows={p.filteredRows} selectedRowKey={p.selectedRowKey} onSelect={p.setSelectedRowKey} />

            {p.rowsError ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', fontSize: 13 }}>{p.rowsError}</div>
            ) : !p.selectedRow ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {p.loadingRows ? 'Loading…' : 'All caught up — nothing matches these filters.'}
              </div>
            ) : (
              <>
                <ImageViewer row={p.selectedRow} imagePreviewUrl={p.imagePreviewUrl} imagePreviewType={p.imagePreviewType} imageLoadError={p.imageLoadError} />

                <div style={{ width: 452, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden' }}>
                  <TransactionSummary row={p.selectedRow} />

                  <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
                    <RightPanelTab label="OCR details" active={rightTab === 'ocr'} onClick={() => setRightTab('ocr')} />
                    <RightPanelTab label="Decision" active={rightTab === 'decision'} dotColor={decisionStarted ? 'var(--accent)' : undefined} onClick={() => setRightTab('decision')} />
                  </div>

                  {rightTab === 'ocr' ? (
                    p.loadingDoc || !p.draftSections ? (
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
                    )
                  ) : (
                    <DecisionPanel
                      taxonomy={p.taxonomy}
                      documentType={p.selectedRow.documentType}
                      draft={p.decisionDraft}
                      onChange={p.setDecisionDraft}
                      onSubmit={p.submit}
                      submitting={p.syncState === 'saving'}
                      loadingDoc={p.loadingDoc}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <StatusFooter
            queueCount={p.masterRows.length}
            pendingCount={p.pendingCount}
            syncState={p.syncState}
            syncMessage={p.syncState === 'error' ? p.syncMessage : undefined}
            loadingProgress={p.rowsLoadProgress}
          />
        </>
      )}
    </div>
  )
}

function RightPanelTab({ label, active, dotColor, onClick }: { label: string; active: boolean; dotColor?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 38,
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'none',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 12.5,
        fontWeight: 600,
        marginBottom: -1,
      }}
    >
      {label}
      {dotColor && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />}
    </button>
  )
}
