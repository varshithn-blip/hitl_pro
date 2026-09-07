import { useState } from 'react'
import { docTypeBadge } from '../lib/presentation'
import type { MasterRow } from '../lib/types'
import { ChevronLeft, ChevronRight, ExternalLink, Maximize, Rotate, ZoomIn, ZoomOut } from './icons'

interface Props {
  row: MasterRow
  siblingDocs: MasterRow[]
  onSelectSibling: (requestId: string) => void
}

const ZOOM_STEP = 25
const MIN_ZOOM = 50
const MAX_ZOOM = 300

export function ImageViewer({ row, siblingDocs, onSelectSibling }: Props) {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)

  const siblingIndex = siblingDocs.findIndex((d) => d.requestId === row.requestId)
  const hasSiblings = siblingDocs.length > 1

  const goPrev = () => {
    if (siblingIndex > 0) onSelectSibling(siblingDocs[siblingIndex - 1].requestId)
  }
  const goNext = () => {
    if (siblingIndex < siblingDocs.length - 1) onSelectSibling(siblingDocs[siblingIndex + 1].requestId)
  }

  const badge = docTypeBadge(row.documentType)

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', borderRight: '1px solid var(--border)' }}>
      <div
        style={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconButton onClick={goPrev} disabled={!hasSiblings || siblingIndex <= 0} title="Previous document in this transaction">
            <ChevronLeft size={14} />
          </IconButton>
          <span style={{ fontSize: 12.5, fontWeight: 500, padding: '0 4px' }}>
            {badge.label}
            {hasSiblings && (
              <>
                {' '}
                &nbsp;·&nbsp; Document {siblingIndex + 1} of {siblingDocs.length}
              </>
            )}
          </span>
          <IconButton onClick={goNext} disabled={!hasSiblings || siblingIndex >= siblingDocs.length - 1} title="Next document in this transaction">
            <ChevronRight size={14} />
          </IconButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconButton onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))} title="Zoom out">
            <ZoomOut size={14} />
          </IconButton>
          <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', width: 40, textAlign: 'center' }}>{zoom}%</span>
          <IconButton onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))} title="Zoom in">
            <ZoomIn size={14} />
          </IconButton>
          <Divider />
          <IconButton onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate">
            <Rotate size={14} />
          </IconButton>
          <IconButton
            onClick={() => {
              setZoom(100)
              setRotation(0)
            }}
            title="Reset view"
          >
            <Maximize size={14} />
          </IconButton>
          <Divider />
          {row.driveLink.href ? (
            <a
              href={row.driveLink.href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
                fontSize: 11.5,
                fontWeight: 500,
              }}
            >
              <ExternalLink size={13} />
              Open in Drive
            </a>
          ) : (
            <span
              title="Link not resolved yet — see README known gaps"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: 11.5,
                fontWeight: 500,
              }}
            >
              <ExternalLink size={13} />
              Open in Drive
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: 'radial-gradient(circle, oklch(90% 0.006 255) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transition: 'transform 120ms ease',
          }}
        >
          {row.imageUrl.href ? (
            <img src={row.imageUrl.href} alt="Document" style={{ maxWidth: 480, borderRadius: 3, boxShadow: '0 12px 28px -8px oklch(20% 0.02 255 / 0.22)' }} />
          ) : (
            <DocumentPlaceholder />
          )}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: 16,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            background: 'oklch(99% 0.002 255 / 0.9)',
            border: '1px solid var(--border-strong)',
            padding: '4px 10px',
            borderRadius: 6,
          }}
        >
          {zoom}% {rotation !== 0 && `· rotated ${rotation}°`}
        </div>
      </div>
    </div>
  )
}

function IconButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: 'none',
        background: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: disabled ? 'oklch(82% 0.006 255)' : 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
}

function DocumentPlaceholder() {
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: -32,
          left: 0,
          fontSize: 10.5,
          fontWeight: 500,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        Preview placeholder — image link not resolved
      </div>
      <div
        style={{
          width: 380,
          background: 'white',
          borderRadius: 3,
          boxShadow: '0 12px 28px -8px oklch(20% 0.02 255 / 0.22), 0 2px 6px oklch(20% 0.02 255 / 0.1)',
          padding: '28px 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottom: '1px solid oklch(92% 0.006 255)' }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: 'oklch(92% 0.006 255)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ width: 130, height: 8, borderRadius: 2, background: 'oklch(88% 0.006 255)' }} />
            <div style={{ width: 90, height: 6, borderRadius: 2, background: 'oklch(92% 0.006 255)' }} />
          </div>
        </div>
        {[70, 88, 55].map((w, i) => (
          <div key={i} style={{ width: `${w}%`, height: 7, borderRadius: 2, background: 'oklch(90% 0.006 255)' }} />
        ))}
      </div>
    </div>
  )
}
