import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEMO_MODE } from '../lib/config'
import { isPdfMimeType } from '../lib/driveApi'
import { docTypeBadge } from '../lib/presentation'
import type { MasterRow } from '../lib/types'
import { ChevronLeft, ChevronRight, ExternalLink, Maximize, Rotate, ZoomIn, ZoomOut } from './icons'

interface Props {
  row: MasterRow
  siblingDocs: MasterRow[]
  onSelectSibling: (requestId: string) => void
  /** Object URL for the fetched document bytes (real mode only, resolved
   * from `row.driveLink.href` — see usePortal's image-resolution effect
   * for why this can't just be rendered as an `<img src>` directly). Null
   * while loading, absent, or in demo mode. */
  imagePreviewUrl: string | null
  /** The fetched file's real content type — a submitted document is just
   * as often a multi-page PDF as an image, and those need a completely
   * different rendering path (see isPdf below). Null until resolved. */
  imagePreviewType: string | null
  imageLoadError: string | null
}

// The "100%" display width for an image — matches the previous fixed
// maxWidth so a document looks the same as before at default zoom; zoom
// scales up/down from here. Deliberately NOT the image's natural
// resolution, which for a phone-camera scan could be huge.
const BASE_DISPLAY_WIDTH = 480

const ZOOM_STEP = 25
const MIN_ZOOM = 50
const MAX_ZOOM = 300
// How many zoom-% points one "notch" of ctrl+wheel/pinch moves — trackpad
// pinch gestures fire many small wheel events, so this is deliberately
// gentler than the +/- buttons' fixed ZOOM_STEP.
const WHEEL_ZOOM_SENSITIVITY = 0.5

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export function ImageViewer({ row, siblingDocs, onSelectSibling, imagePreviewUrl, imagePreviewType, imageLoadError }: Props) {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  // The rotated content's own (pre-rotation) box size, kept in sync via
  // ResizeObserver — needed to fix panning at 90°/270°. See the render
  // below for why.
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null)
  // Where to move scroll to AFTER the next re-render picks up a new zoom,
  // so a cursor-anchored zoom (see handleWheel) lands correctly against
  // the post-zoom scrollable size rather than the stale pre-zoom one.
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)

  // PDFs (a submitted document is just as often a scanned multi-page PDF
  // as a single image) render through the browser's own PDF viewer in an
  // iframe instead — it already has its own zoom/pan/page navigation, so
  // none of this component's custom zoom/rotate/pan machinery applies.
  const isPdf = isPdfMimeType(imagePreviewType)
  const isSideways = rotation === 90 || rotation === 270

  const siblingIndex = siblingDocs.findIndex((d) => d.requestId === row.requestId)
  const hasSiblings = siblingDocs.length > 1

  const goPrev = () => {
    if (siblingIndex > 0) onSelectSibling(siblingDocs[siblingIndex - 1].requestId)
  }
  const goNext = () => {
    if (siblingIndex < siblingDocs.length - 1) onSelectSibling(siblingDocs[siblingIndex + 1].requestId)
  }

  const badge = docTypeBadge(row.documentType)

  // Ctrl+wheel (trackpad pinch shows up as this) zooms the image and stops
  // there — without preventDefault the browser zooms the whole page
  // instead, which was the original complaint. Plain wheel/two-finger
  // scroll (no ctrlKey) is left alone entirely, so it pans via the
  // container's native scrolling. Attached as a real DOM listener with
  // {passive:false}, since React's onWheel can't reliably preventDefault
  // a gesture the browser wants to treat as page zoom.
  useEffect(() => {
    const el = canvasRef.current
    if (!el || isPdf) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // plain scroll: let native panning happen
      e.preventDefault()

      const rect = el.getBoundingClientRect()
      const pointerX = e.clientX - rect.left + el.scrollLeft
      const pointerY = e.clientY - rect.top + el.scrollTop

      setZoom((prevZoom) => {
        const nextZoom = clampZoom(prevZoom - e.deltaY * WHEEL_ZOOM_SENSITIVITY)
        const scaleRatio = nextZoom / prevZoom
        pendingScrollRef.current = {
          left: pointerX * scaleRatio - (e.clientX - rect.left),
          top: pointerY * scaleRatio - (e.clientY - rect.top),
        }
        return nextZoom
      })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [isPdf])

  // Applies a cursor-anchored zoom's pending scroll position once the DOM
  // has actually re-rendered at the new size (scrollWidth/scrollHeight
  // only reflect it after that render).
  useLayoutEffect(() => {
    if (pendingScrollRef.current && canvasRef.current) {
      canvasRef.current.scrollLeft = pendingScrollRef.current.left
      canvasRef.current.scrollTop = pendingScrollRef.current.top
      pendingScrollRef.current = null
    }
  }, [zoom])

  // Tracks the rotated content's own (pre-rotation) rendered size. Needed
  // because `transform: rotate()` — like `scale()` before it — doesn't
  // affect layout size: at 90°/270° the visual footprint is the WIDTH and
  // HEIGHT swapped, but every ancestor doing size-based layout (the
  // fit-content centering wrapper below, and therefore this scrollable
  // container's scrollWidth/scrollHeight) still measures the untouched,
  // un-swapped box. That mismatch is exactly why panning broke once
  // rotated: the scrollable area kept the unrotated shape's dimensions
  // instead of the rotated one's, so it couldn't extend far enough in
  // whichever axis the rotation had actually made larger. Observing (not
  // just reading once) is what keeps this correct as zoom changes too,
  // not just on mount.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0]
      setContentSize(box ? { width: box.inlineSize, height: box.blockSize } : { width: el.offsetWidth, height: el.offsetHeight })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Click-and-drag panning, in addition to native scrollbar/trackpad
  // scrolling — the more discoverable "grab and drag" interaction people
  // expect from an image/map viewer.
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPdf || e.button !== 0 || !canvasRef.current) return
    dragStateRef.current = { x: e.clientX, y: e.clientY, scrollLeft: canvasRef.current.scrollLeft, scrollTop: canvasRef.current.scrollTop }
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      const start = dragStateRef.current
      if (!start || !canvasRef.current) return
      canvasRef.current.scrollLeft = start.scrollLeft - (e.clientX - start.x)
      canvasRef.current.scrollTop = start.scrollTop - (e.clientY - start.y)
    }
    const handleMouseUp = () => {
      dragStateRef.current = null
      setIsDragging(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

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
          {isPdf ? (
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '0 6px' }}>PDF · use the built-in viewer's own zoom/scroll</span>
          ) : (
            <>
              <IconButton onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))} title="Zoom out">
                <ZoomOut size={14} />
              </IconButton>
              <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', width: 40, textAlign: 'center' }}>{Math.round(zoom)}%</span>
              <IconButton onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))} title="Zoom in">
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
            </>
          )}
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

      {isPdf && imagePreviewUrl ? (
        <iframe src={imagePreviewUrl} title="Document PDF" style={{ flex: 1, minHeight: 0, border: 'none', background: 'var(--bg-app)' }} />
      ) : (
        <div
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            backgroundImage: 'radial-gradient(circle, oklch(90% 0.006 255) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            overflow: 'auto',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: isDragging ? 'none' : undefined,
          }}
        >
          {/* min-*:100% + fit-content is what makes panning reach the true
              edges at high zoom: when the (rotated) content is smaller
              than the viewport this box is exactly viewport-sized and
              flex-centers it (today's look at 100%); once zoomed content
              exceeds the viewport, min-width/height stop being the
              binding constraint and this box shrinks to exactly the
              content's own size, so the scrollable area is exactly the
              content and scrollLeft/Top can reach 0 and (scrollWidth -
              clientWidth) — the true left/top and right/bottom edges.
              A wrapper doing this via `transform: scale()` instead (the
              previous approach) can't: transform doesn't affect layout
              size, so the flex-centered box stays viewport-sized even
              when the *painted* content is much bigger, silently capping
              how far you can scroll toward the near edge. */}
          <div style={{ minWidth: '100%', minHeight: '100%', width: 'fit-content', height: 'fit-content', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Sized to the SWAPPED (visual, post-rotation) footprint at
                90°/270° once contentSize is known, so this box's own
                layout size matches what's actually painted — the fix for
                the comment above `useEffect`'s ResizeObserver. At
                0°/180° no swap is needed (rotation doesn't change the
                bounding box), so it just shrinks to the content's own
                size like before. Always the SAME two nested elements
                (never conditionally mounted/unmounted) so the
                ResizeObserver's target node never changes out from under
                it. */}
            <div
              style={
                isSideways && contentSize
                  ? { position: 'relative', width: contentSize.height, height: contentSize.width }
                  : { position: 'relative', width: 'fit-content', height: 'fit-content' }
              }
            >
              <div
                ref={contentRef}
                style={{
                  ...(isSideways && contentSize ? { position: 'absolute', inset: 0, margin: 'auto' } : undefined),
                  width: 'fit-content',
                  transform: `rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 120ms ease',
                }}
              >
                {imagePreviewUrl ? (
                  <img
                    src={imagePreviewUrl}
                    alt="Document"
                    draggable={false}
                    style={{ display: 'block', width: BASE_DISPLAY_WIDTH * (zoom / 100), borderRadius: 3, boxShadow: '0 12px 28px -8px oklch(20% 0.02 255 / 0.22)' }}
                  />
                ) : (
                  <DocumentPlaceholder error={imageLoadError} zoom={zoom} />
                )}
              </div>
            </div>
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
              pointerEvents: 'none',
            }}
          >
            {Math.round(zoom)}% {rotation !== 0 && `· rotated ${rotation}°`}
          </div>
        </div>
      )}
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

function DocumentPlaceholder({ error, zoom }: { error?: string | null; zoom: number }) {
  const width = BASE_DISPLAY_WIDTH * (zoom / 100)
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: -32,
          left: 0,
          fontSize: 10.5,
          fontWeight: 500,
          color: error ? 'var(--danger)' : 'var(--text-muted)',
          whiteSpace: error ? 'normal' : 'nowrap',
          width: error ? width : 'auto',
        }}
      >
        {error ?? (DEMO_MODE ? 'Preview placeholder — demo mode has no real images' : 'Loading image…')}
      </div>
      <div
        style={{
          width,
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
          <div style={{ width: 30, height: 30, borderRadius: 6, background: 'oklch(92% 0.006 255)', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
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
