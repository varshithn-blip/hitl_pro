// A Drive "view" link (drive.google.com/file/d/<id>/view, .../open?id=<id>,
// etc.) opens fine as a normal browser navigation — Drive serves an HTML
// viewer page for it — but that same URL can't be embedded in an <img>
// tag, since an <img> needs raw image bytes, not an HTML page. Confirmed
// against the real master sheet: the "Open in Drive" link (a plain <a
// href>, i.e. a real navigation) works, while the inline preview (an <img
// src> pointed at the same resolved link) doesn't — exactly this
// mismatch.
//
// Fix: pull the file id out of whatever Drive URL shape we resolved, fetch
// its bytes through the Drive API with the signed-in reviewer's own OAuth
// token, and hand the browser a blob: URL instead. This also sidesteps
// having to know or rely on the file's public link-sharing setting —
// works as long as the signed-in reviewer's account can see the file,
// same as everything else in this app.

const DRIVE_FILE_ID_PATTERNS = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/]

export function extractDriveFileId(url: string | null): string | null {
  if (!url) return null
  for (const pattern of DRIVE_FILE_ID_PATTERNS) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export class DriveApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export interface DriveFilePreview {
  url: string
  /** The file's real content type (e.g. "application/pdf", "image/jpeg") —
   * a submitted document isn't always an image; loan/payslip/credit/coe
   * uploads can just as easily be a scanned multi-page PDF, and a PDF
   * can't be rendered in an <img> tag at all. Callers branch on this to
   * pick <img> vs a PDF-capable viewer. */
  mimeType: string
}

/** Fetches a Drive file's raw bytes and returns a `blob:` object URL for
 * it (plus its content type, for picking how to render it). Caller owns
 * the URL's lifetime — call `URL.revokeObjectURL` on it once it's no
 * longer shown, or the blob stays pinned in memory for the life of the
 * tab. Pass `signal` (an AbortController's) so switching to a different
 * row before this resolves actually stops the download — a full-size
 * scanned document can be several MB, and on a weak connection a
 * reviewer clicking through the queue quickly can otherwise leave
 * several of these downloading in the background at once, each one
 * discarded on arrival. */
export async function fetchDriveFileObjectUrl(fileId: string, accessToken: string, signal?: AbortSignal): Promise<DriveFilePreview> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })
  if (!res.ok) {
    const status = res.status
    const hint = status === 403 || status === 404 ? ' — the signed-in account may not have access to this file.' : ''
    throw new DriveApiError(`Failed to load the document from Drive (${status})${hint}`, status)
  }
  const blob = await res.blob()
  const mimeType = blob.type || res.headers.get('content-type') || 'application/octet-stream'
  return { url: URL.createObjectURL(blob), mimeType }
}

export function isPdfMimeType(mimeType: string | null): boolean {
  return mimeType?.toLowerCase().includes('pdf') ?? false
}

/** Whether to skip speculative work (currently: prefetching the next
 * queue item's image) because the connection looks too slow or metered
 * to spend on something the reviewer might not even reach. Reads the
 * browser's Network Information API (`navigator.connection`) where
 * available — Data Saver mode, or an effective type of 2G or slower.
 * Not every browser exposes this (notably Safari/Firefox as of writing);
 * `false` (allow prefetching) is the correct default when it's simply
 * unavailable, not a signal either way about the real connection. */
export function isSlowConnection(): boolean {
  const connection = (navigator as any).connection
  if (!connection) return false
  if (connection.saveData) return true
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g'
}
