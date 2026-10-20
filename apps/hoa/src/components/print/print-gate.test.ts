import { describe, expect, it } from 'vitest'
import { DRAFT_PRINT_BANNER, armedPrint, documentPrintClass, type PrintWindow } from './print-gate'

/** A window whose print() records whether the document was armed at that moment. */
function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>()
  const printedArmed: boolean[] = []
  let armed = false
  const win: PrintWindow = {
    print: () => {
      printedArmed.push(armed)
    },
    addEventListener: (t, fn) => {
      if (!listeners.has(t)) listeners.set(t, new Set())
      listeners.get(t)!.add(fn)
    },
    removeEventListener: (t, fn) => {
      listeners.get(t)?.delete(fn)
    },
  }
  const fire = (t: string) => [...(listeners.get(t) ?? [])].forEach((fn) => fn())
  const setArmed = (v: boolean) => {
    armed = v
  }
  return { win, fire, setArmed, printedArmed, isArmed: () => armed, listenerCount: (t: string) => listeners.get(t)?.size ?? 0 }
}

const sync = (fn: () => void) => fn()

describe('print gate', () => {
  it('hides the document from print unless armed', () => {
    expect(documentPrintClass(false)).toBe('print:hidden')
    expect(documentPrintClass(true)).toBe('')
    expect(DRAFT_PRINT_BANNER).toBe('DRAFT — NOT VALID — print from the Print button')
  })

  it('arms before window.print() and disarms on afterprint', () => {
    const w = fakeWindow()
    armedPrint(w.win, w.setArmed, sync)
    expect(w.printedArmed).toEqual([true])
    expect(w.isArmed()).toBe(true)
    w.fire('afterprint')
    expect(w.isArmed()).toBe(false)
    expect(w.listenerCount('afterprint')).toBe(0)
  })

  it('a browser print (Cmd+P) never arms it', () => {
    const w = fakeWindow()
    w.fire('beforeprint')
    w.win.print()
    w.fire('afterprint')
    expect(w.printedArmed).toEqual([false])
    // After an armed print has finished, the next Cmd+P is a draft again.
    armedPrint(w.win, w.setArmed, sync)
    w.fire('afterprint')
    w.win.print()
    expect(w.printedArmed).toEqual([false, true, false])
  })

  it('disarms even if print() throws', () => {
    const w = fakeWindow()
    w.win.print = () => {
      throw new Error('blocked')
    }
    expect(() => armedPrint(w.win, w.setArmed, sync)).toThrow('blocked')
    expect(w.isArmed()).toBe(false)
  })
})
