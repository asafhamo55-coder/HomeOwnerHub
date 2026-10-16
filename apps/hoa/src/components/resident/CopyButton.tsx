'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/**
 * Copies `value` to the clipboard. The label says what is copied ("Copy
 * memo code") so a screen reader user hears which of several buttons this
 * is; the visible text stays short. When the Clipboard API is unavailable
 * (older iOS in an insecure context) it says so rather than pretending.
 */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={copy}
      aria-label={label}
      icon={state === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />}
      className={className}
    >
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select & copy' : 'Copy'}</span>
    </Button>
  )
}
