/**
 * The print gate for legal documents (estoppel certificate, collections
 * letters, budget notice). Pure and client-safe; usePrintGate.tsx wires it
 * to React.
 *
 * A page's own Print button runs its checks (BLANKs filled, figures
 * verified, the server's audit row and collections event recorded), then
 * ARMS the document just before window.print() and disarms it on
 * `afterprint`. Unarmed, the document carries `print:hidden` and a
 * print-only banner shows instead — so Cmd+P / File > Print, which skip
 * every check, never produce a usable document.
 *
 * `beforeprint` is deliberately not listened to: it fires for Cmd+P too.
 */

export const DRAFT_PRINT_BANNER = 'DRAFT — NOT VALID — print from the Print button'

export function documentPrintClass(armed: boolean): string {
  return armed ? '' : 'print:hidden'
}

export interface PrintWindow {
  print: () => void
  addEventListener: (type: 'afterprint', fn: () => void) => void
  removeEventListener: (type: 'afterprint', fn: () => void) => void
}

/**
 * Arm, print, disarm on afterprint. `flush` must apply `setArmed(true)` to
 * the DOM before it returns (react-dom's flushSync), because the browser
 * prints the page as it stands when print() is called.
 */
export function armedPrint(win: PrintWindow, setArmed: (armed: boolean) => void, flush: (fn: () => void) => void): void {
  const disarm = () => {
    win.removeEventListener('afterprint', disarm)
    setArmed(false)
  }
  win.addEventListener('afterprint', disarm)
  flush(() => setArmed(true))
  try {
    win.print()
  } catch (e) {
    disarm()
    throw e
  }
}
