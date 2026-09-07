import { baseDocType } from './taxonomy'
import type { MasterRow } from './types'

/** Cosmetic per-doc-type badge colors and a display label. Purely
 * presentational — never affects which schema/taxonomy is used for a
 * document, that's always driven by `baseDocType()`. */
const DOC_TYPE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  loan: { label: 'Loan Statement', bg: 'oklch(93% 0.03 230)', fg: 'oklch(42% 0.11 230)' },
  payslip: { label: 'Payslip', bg: 'oklch(93% 0.035 150)', fg: 'oklch(40% 0.1 150)' },
  credit: { label: 'Credit Card Stmt', bg: 'oklch(93% 0.035 30)', fg: 'oklch(45% 0.13 30)' },
  coe: { label: 'Cert. of Employment', bg: 'oklch(93% 0.03 300)', fg: 'oklch(46% 0.13 300)' },
}

export function docTypeBadge(documentType: string): { label: string; bg: string; fg: string } {
  const base = baseDocType(documentType)
  return DOC_TYPE_STYLE[base] ?? { label: documentType, bg: 'oklch(92% 0.006 255)', fg: 'oklch(40% 0.012 255)' }
}

export function statusDotColor(row: MasterRow): string {
  if (row.status === 'Manually Approved') return 'var(--success)'
  if (row.status === 'Manually Rejected') return 'var(--danger)'
  return 'var(--warning)' // pending / not yet reviewed
}

export function reviewerInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** A stable-ish color per reviewer, purely so avatars are visually
 * distinguishable at a glance — not tied to any identity system. */
const AVATAR_HUES = [255, 60, 20, 150, 300, 190]
export function avatarColor(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length]
  return { bg: `oklch(90% 0.04 ${hue})`, fg: `oklch(40% 0.09 ${hue})` }
}
