'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * For a dialog that swaps its body between steps (menu → form → done).
 * The control the board just pressed unmounts with the old step, so focus
 * would fall back to the dialog shell and a screen reader hears nothing of
 * the new step. On every change of `step` after the first render, focus
 * moves to the first control in the new step. The initial focus stays with
 * the dialog primitive.
 */
export function useFocusFirstOnChange<T extends HTMLElement = HTMLDivElement>(step: unknown) {
  const ref = useRef<T>(null)
  // The last step seen, not a "mounted" flag: Strict Mode re-runs effects
  // on mount, and that re-run must not count as a change.
  const last = useRef(step)
  useEffect(() => {
    if (Object.is(last.current, step)) return
    last.current = step
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [step])
  return ref
}
