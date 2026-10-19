import * as React from 'react'
import { cn } from '../lib/cn'
import { LOGO } from '../tokens'

/**
 * Ledger logo (BL-094) as inline SVG, so it inherits no network request
 * and scales crisply. Geometry is identical to the static files in
 * apps/{hoa,marketing}/public/brand/ — change both together.
 *
 * The mark is a fixed brand asset: its tile stays blue-600 in dark mode
 * (the dark `primary` is a lighter blue that white would not read on), so
 * it uses LOGO from tokens.ts rather than the themed `primary` class. The
 * wordmark strokes use `currentColor`, which defaults to `text-foreground`
 * and so follows the theme.
 */

const LEDGER_PATHS = (
  <>
    <path d="M7 15.5 16 7.5l9 8M21.5 11.5V8" stroke={LOGO.light.glyph} strokeWidth="3" />
    <path d="M10.5 19.75h11" stroke={LOGO.light.glyph} strokeWidth="2.75" />
    <path d="M10.5 24.5h6.5" stroke={LOGO.light.line} strokeWidth="2.75" />
  </>
)

export function LedgerMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8 shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <rect width="32" height="32" rx="7.5" fill={LOGO.light.tile} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {LEDGER_PATHS}
      </g>
    </svg>
  )
}

/** "Ledger", drawn as monoline strokes in currentColor. */
export function LedgerWordmark({ className, title = 'Ledger' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 92 34"
      className={cn('h-6 w-auto text-foreground', className)}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 4.5v20h8.5" />
        <path d="M17 19h11a5.5 5.5 0 1 0-1.3 3.55" />
        <circle cx="38.5" cy="19" r="5.5" />
        <path d="M44 4.5v20" />
        <circle cx="55" cy="19" r="5.5" />
        <path d="M60.5 13.5v14a4.75 4.75 0 0 1-9 2.1" />
        <path d="M65.5 19h11a5.5 5.5 0 1 0-1.3 3.55" />
        <path d="M81 24.5V19a5.5 5.5 0 0 1 6.5-5.4" />
      </g>
    </svg>
  )
}

/** Mark + wordmark lockup. `size` sets the mark; the wordmark follows. */
export function LedgerLogo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const mark = { sm: 'size-6', md: 'size-7', lg: 'size-9' }[size]
  const word = { sm: 'h-[18px]', md: 'h-[21px]', lg: 'h-[26px]' }[size]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LedgerMark className={mark} />
      <LedgerWordmark className={word} />
    </span>
  )
}
