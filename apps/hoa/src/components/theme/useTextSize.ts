'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { isTextSize, readTextSize, saveTextSize, textSizeLabel, type TextSize } from '@/lib/larger-text'

// The pre-paint script (and applyTextSize) put the size on <html data-text-size>.
// Reading it there means the right radio is checked on the first client render,
// with no one-frame flash of "Normal". The server snapshot is 'normal'.
const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
function getSnapshot(): TextSize {
  const v = document.documentElement.dataset.textSize
  // No attribute (init script blocked or not run): fall back to the saved value.
  return isTextSize(v) ? v : readTextSize()
}
function getServerSnapshot(): TextSize {
  return 'normal'
}

/** Current text size plus a setter and a sentence for a live region. */
export function useTextSize() {
  const size = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [message, setMessage] = useState('')

  const choose = useCallback((next: TextSize) => {
    const saved = saveTextSize(next)
    listeners.forEach((l) => l())
    setMessage(
      saved
        ? `Text size set to ${textSizeLabel(next)}.`
        : `Text size set to ${textSizeLabel(next)} for this visit only. Your browser blocked saving it.`,
    )
  }, [])

  return { size, choose, message }
}
