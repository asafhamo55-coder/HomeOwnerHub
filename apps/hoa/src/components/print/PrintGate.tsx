'use client'

import { useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import { DRAFT_PRINT_BANNER, armedPrint, documentPrintClass } from './print-gate'

/**
 * `printArmed` is true only between the page's own Print button calling
 * `print()` and the browser's `afterprint`. Put `docClass` on the
 * document's <article> and render <DraftPrintBanner armed={printArmed} />
 * beside it. See print-gate.ts.
 */
export function usePrintGate() {
  const [printArmed, setPrintArmed] = useState(false)
  const print = useCallback(() => armedPrint(window, setPrintArmed, (fn) => flushSync(fn)), [])
  return { printArmed, print, docClass: documentPrintClass(printArmed) }
}

/** Print-only: what a browser print (Cmd+P) shows in place of the document. */
export function DraftPrintBanner({ armed }: { armed: boolean }) {
  if (armed) return null
  return (
    <p role="note" className="hidden border-4 border-foreground p-6 text-center text-2xl font-bold uppercase text-foreground print:block">
      {DRAFT_PRINT_BANNER}
    </p>
  )
}
