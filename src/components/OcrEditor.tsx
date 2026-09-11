import type { OcrSection } from '../lib/types'
import { AlertTriangle, Plus, X } from './icons'

interface Props {
  sections: OcrSection[]
  onFieldChange: (sectionIndex: number, fieldIndex: number, value: string) => void
  onTableCellChange: (sectionIndex: number, rowIndex: number, colIndex: number, value: string) => void
  onAddTableRow: (sectionIndex: number) => void
  onRemoveTableRow: (sectionIndex: number, rowIndex: number) => void
}

const fieldBoxStyle: React.CSSProperties = {
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  fontSize: 12.5,
  background: 'white',
  width: '100%',
}

export function OcrEditor({ sections, onFieldChange, onTableCellChange, onAddTableRow, onRemoveTableRow }: Props) {
  return (
    <div className="rd-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.map((section, sIdx) =>
        section.kind === 'fields' ? (
          <FieldsSection key={sIdx} section={section} onFieldChange={(fIdx, v) => onFieldChange(sIdx, fIdx, v)} />
        ) : (
          <TableSection
            key={sIdx}
            section={section}
            onCellChange={(rIdx, cIdx, v) => onTableCellChange(sIdx, rIdx, cIdx, v)}
            onAddRow={() => onAddTableRow(sIdx)}
            onRemoveRow={(rIdx) => onRemoveTableRow(sIdx, rIdx)}
          />
        ),
      )}
    </div>
  )
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 7,
        marginBottom: 10,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</span>
      {action}
    </div>
  )
}

function FieldsSection({
  section,
  onFieldChange,
}: {
  section: Extract<OcrSection, { kind: 'fields' }>
  onFieldChange: (fieldIndex: number, value: string) => void
}) {
  return (
    <div>
      <SectionTitle>{section.title || 'Fields'}</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {section.fields.map((field, fIdx) => {
          const hasSuggestions = !!field.validationOptions?.length
          const datalistId = hasSuggestions ? `ocr-field-options-${field.rowIndex}` : undefined
          return (
            <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, width: 124, flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{field.label}</span>
                {field.remark && field.remark.toLowerCase() !== 'ok' && !field.remark.toLowerCase().endsWith(' ok') && (
                  <span title={field.remark} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 600, color: 'var(--warning)' }}>
                    <AlertTriangle size={11} />
                  </span>
                )}
                {hasSuggestions && (
                  <span
                    title={`${field.validationOptions!.length} suggestion${field.validationOptions!.length === 1 ? '' : 's'} read live from this cell's dropdown in the sheet — still a free-text field, so a value that doesn't match any of them stays as-is.`}
                    style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent)', cursor: 'help' }}
                  >
                    ▾ SHEET
                  </span>
                )}
              </div>
              {/* Suggestions, not a locked choice — a plain text input with
                  an optional <datalist>, so an OCR value that doesn't match
                  any live option is never blocked or silently reset (see
                  OcrField.validationOptions and attachFieldValidation). */}
              <input
                list={datalistId}
                value={field.value}
                onChange={(e) => onFieldChange(fIdx, e.target.value)}
                style={{ ...fieldBoxStyle, padding: '7px 9px', flex: 1, minWidth: 0 }}
              />
              {hasSuggestions && (
                <datalist id={datalistId}>
                  {field.validationOptions!.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TableSection({
  section,
  onCellChange,
  onAddRow,
  onRemoveRow,
}: {
  section: Extract<OcrSection, { kind: 'table' }>
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void
  onAddRow: () => void
  onRemoveRow: (rowIndex: number) => void
}) {
  return (
    <div>
      <SectionTitle
        action={
          <button
            onClick={onAddRow}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 11, fontWeight: 500, color: 'var(--accent)' }}
          >
            <Plus size={12} />
            Add row
          </button>
        }
      >
        {section.title}
      </SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${section.columns.length - 1}, 1fr) 18px`, gap: 8, padding: '0 2px' }}>
          {section.columns.map((c, i) => (
            <span key={i} style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {c}
            </span>
          ))}
          <span />
        </div>

        {section.rows.map((row) => {
          const isNew = row.rowIndex <= 0
          return (
            <div
              key={row.rowIndex}
              style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${section.columns.length - 1}, 1fr) 18px`, gap: 8, alignItems: 'center' }}
            >
              {section.columns.map((_, cIdx) => (
                <input
                  key={cIdx}
                  value={row.cells[cIdx] ?? ''}
                  onChange={(e) => onCellChange(row.rowIndex, cIdx, e.target.value)}
                  style={{ ...fieldBoxStyle, padding: '6px 8px', fontSize: 12 }}
                />
              ))}
              {isNew ? (
                <button onClick={() => onRemoveRow(row.rowIndex)} title="Remove this row" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                  <X size={13} />
                </button>
              ) : (
                <span />
              )}
            </div>
          )
        })}

        {section.rows.some((r) => r.rowIndex <= 0) && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>New rows save with the rest of your changes on Submit.</span>
        )}
      </div>
    </div>
  )
}
