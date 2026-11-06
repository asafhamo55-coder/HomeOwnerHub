'use client'

import { useCallback, useEffect, useState } from 'react'
import { readTextSize, saveTextSize, textSizeLabel, type TextSize } from '@/lib/larger-text'

/** Current text size plus a setter and a sentence for a live region. */
export function useTextSize() {
  const [size, setSize] = useState<TextSize>('normal')
  const [message, setMessage] = useState('')

  // The pre-paint script already applied the saved size; this syncs state.
  useEffect(() => {
    setSize(readTextSize())
  }, [])

  const choose = useCallback((next: TextSize) => {
    setSize(next)
    const saved = saveTextSize(next)
    setMessage(
      saved
        ? `Text size set to ${textSizeLabel(next)}.`
        : `Text size set to ${textSizeLabel(next)} for this visit only. Your browser blocked saving it.`,
    )
  }, [])

  return { size, choose, message }
}
