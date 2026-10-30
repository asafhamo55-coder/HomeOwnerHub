import * as React from 'react'
import { cn } from '../lib/cn'
import { LOGO } from '../tokens'
import { MARK, WORDMARK } from '../brand-geometry'

export { MARK, WORDMARK }

/**
 * HomeownerHub logo (BL-098, concept C) as inline SVG, so it needs no
 * network request and scales crisply.
 *
 * Mark: an H whose crossbar is a roof; the space under the roof is the
 * house, with a light-violet door. The door is required, not decorative —
 * without it the shape can read as an "A" between two posts.
 *
 * Wordmark: "HomeownerHub" in monoline strokes (no font needed).
 * "Homeowner" is `currentColor` (defaults to `text-foreground`, so it
 * follows the theme); "Hub" is the brand violet — LOGO.light.accent on light,
 * LOGO.dark.accent on dark.
 *
 * The geometry (../brand-geometry.ts) is the single source for the static
 * files in apps/{hoa,marketing}/public/brand/ too: `pnpm brand:assets`
 * (scripts/build-brand-assets.ts) builds every SVG/PNG/ICO from it.
 *
 * The mark is a fixed brand asset: its tile is violet in both modes (one
 * step lighter on dark so it stands off the canvas); white would not read
 * on the dark `primary`, so it uses LOGO from tokens.ts, not `primary`.
 */

/**
 * Tailwind classes for "Hub". Literal strings because Tailwind only sees
 * classes written out in source; tokens.test.ts checks they equal
 * LOGO.light.accent / LOGO.dark.accent.
 */
export const HUB_ACCENT_CLASS = 'text-[#4B27C9] dark:text-[#CBC2FF]'

/** Tile fill per theme; literal for Tailwind, checked against LOGO in tokens.test.ts. */
export const MARK_TILE_CLASS = 'fill-[#4B27C9] dark:fill-[#6340E0]'

export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={MARK.viewBox}
      className={cn('size-8 shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <rect
        width="32"
        height="32"
        rx={MARK.tileRadius}
        fill={LOGO.light.tile}
        className={MARK_TILE_CLASS}
      />
      <g fill="none" stroke={LOGO.light.glyph} strokeLinecap="round" strokeLinejoin="round">
        <path d={MARK.stems.d} strokeWidth={MARK.stems.strokeWidth} />
        <path d={MARK.roof.d} strokeWidth={MARK.roof.strokeWidth} />
      </g>
      <rect {...MARK.door} fill={LOGO.light.line} />
    </svg>
  )
}

/** "HomeownerHub", drawn as monoline strokes: "Homeowner" in currentColor, "Hub" in brand violet. */
export function BrandWordmark({ className, title = 'HomeownerHub' }: { className?: string; title?: string }) {
  const glyph = (g: (typeof WORDMARK.glyphs)[number]) => (
    <path key={g.x} transform={`translate(${g.x} 0)`} d={g.d} />
  )
  return (
    <svg
      viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
      className={cn('h-6 w-auto text-foreground', className)}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <g fill="none" strokeWidth={WORDMARK.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <g stroke="currentColor">{WORDMARK.glyphs.filter((g) => !g.hub).map(glyph)}</g>
        <g stroke="currentColor" className={HUB_ACCENT_CLASS}>
          {WORDMARK.glyphs.filter((g) => g.hub).map(glyph)}
        </g>
      </g>
    </svg>
  )
}

/** Mark + wordmark lockup. `size` sets the mark; the wordmark follows. */
export function BrandLogo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const mark = { sm: 'size-6', md: 'size-7', lg: 'size-9' }[size]
  const word = { sm: 'h-[18px]', md: 'h-[21px]', lg: 'h-[26px]' }[size]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark className={mark} />
      <BrandWordmark className={word} />
    </span>
  )
}
