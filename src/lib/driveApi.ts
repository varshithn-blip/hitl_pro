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
 * tab. */
export async function fetchDriveFileObjectUrl(fileId: string, accessToken: string): Promise<DriveFilePreview> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
