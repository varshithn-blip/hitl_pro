// Small shared retry helper for transient network failures — relevant
// specifically because reviewers on this app are explicitly not always
// on a strong connection (see README). Wraps a single async attempt and
// retries it a bounded few times with exponential backoff, but only for
// failures a retry could plausibly fix.

const MAX_RETRIES = 2
const BASE_DELAY_MS = 600

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Never retries an aborted request — that's a deliberate cancellation
 * (e.g. the reviewer switched rows before this landed, see the
 * AbortController wiring in usePortal.ts), and retrying it would just
 * repeat work nobody wants anymore. Never retries an auth/permission
 * error (401/403/404) either — the sheet/file access itself is the
 * problem there, not the network, so a retry can't fix it and would
 * just delay surfacing the real error. Everything else — a 429 (rate
 * limited), a 5xx, or no status at all (a dropped connection, DNS
 * hiccup, the request never got a response) — is exactly the class of
 * flaky-network failure this exists to smooth over. */
function isRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return false
  const status = (err as { status?: number } | null | undefined)?.status
  if (typeof status === 'number') return status === 429 || status >= 500
  return true
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err
      await sleep(BASE_DELAY_MS * 2 ** attempt)
    }
  }
  throw lastErr
}
