import type { CSSProperties } from 'react'

interface IconProps {
  size?: number
  style?: CSSProperties
}

function base(children: React.ReactNode, { size = 16, style }: IconProps = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  )
}

export const ChevronDown = (p: IconProps) => base(<path d="M6 9l6 6 6-6" />, p)
export const ChevronLeft = (p: IconProps) => base(<path d="M15 18l-6-6 6-6" />, p)
export const ChevronRight = (p: IconProps) => base(<path d="M9 18l6-6-6-6" />, p)
export const Search = (p: IconProps) =>
  base(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </>,
    p,
  )
export const ZoomIn = (p: IconProps) =>
  base(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 8v6M8 11h6M21 21l-4.35-4.35" />
    </>,
    p,
  )
export const ZoomOut = (p: IconProps) =>
  base(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M8 11h6M21 21l-4.35-4.35" />
    </>,
    p,
  )
export const Maximize = (p: IconProps) =>
  base(<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />, p)
export const Rotate = (p: IconProps) =>
  base(
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </>,
    p,
  )
export const ExternalLink = (p: IconProps) =>
  base(
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
    </>,
    p,
  )
export const AlertTriangle = (p: IconProps) =>
  base(
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>,
    p,
  )
export const CheckCircle = (p: IconProps) =>
  base(
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </>,
    p,
  )
export const Plus = (p: IconProps) => base(<path d="M12 5v14M5 12h14" />, p)
export const X = (p: IconProps) => base(<path d="M18 6L6 18M6 6l12 12" />, p)
export const Check = (p: IconProps) => base(<path d="M20 6L9 17l-5-5" />, p)
export const ArrowRight = (p: IconProps) => base(<path d="M5 12h14M13 6l6 6-6 6" />, p)
