'use client'

import { useEffect, useLayoutEffect, useState } from 'react'

// ECharts paints text with fixed pixel sizes, so it ignores the Text size
// setting (a root font-size percentage on <html>, see lib/larger-text.ts).
// This hook reads the computed root size and re-renders when it changes.

/** Smallest chart text, matching the app-wide 12px floor. */
export const MIN_CHART_FONT_PX = 12

/** Root font size in px divided by the 16px browser default. */
export function computeChartFontScale(rootFontSizePx: number): number {
  if (!Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0) return 1
  return rootFontSizePx / 16
}

/** Scale a base chart font size, never going below the 12px floor. */
export function scaleChartFont(base: number, scale: number): number {
  return Math.max(MIN_CHART_FONT_PX, Math.round(base * scale))
}

/** Scale a spacing value (grid padding) by the same factor. */
export function scaleChartSpace(base: number, scale: number): number {
  return Math.round(base * scale)
}

function readScale(): number {
  if (typeof document === 'undefined') return 1
  return computeChartFontScale(parseFloat(getComputedStyle(document.documentElement).fontSize))
}

// useLayoutEffect warns during server render, so fall back to useEffect there.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** 1 on the server and first render; the live root scale after mount. */
export function useChartFontScale(): number {
  const [scale, setScale] = useState(1)
  useIsoLayoutEffect(() => {
    const read = () => setScale(readScale())
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-text-size'],
    })
    return () => obs.disconnect()
  }, [])
  return scale
}
