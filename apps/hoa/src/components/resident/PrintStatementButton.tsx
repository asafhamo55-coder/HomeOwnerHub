'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/**
 * Prints the statement in the light theme whatever the screen theme is: a
 * dark-mode statement prints light text on paper (browsers drop the dark
 * backgrounds). Covers the button and the browser's own Print / ⌘P via
 * beforeprint/afterprint, restoring the reader's theme afterwards.
 */
export function PrintStatementButton() {
  useEffect(() => {
    const root = document.documentElement
    let wasDark = false
    const before = () => {
      wasDark = root.classList.contains('dark')
      if (wasDark) root.classList.remove('dark')
    }
    const after = () => {
      if (wasDark) root.classList.add('dark')
      wasDark = false
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  return (
    <Button type="button" icon={<Printer aria-hidden />} onClick={() => window.print()}>
      Print or save PDF
    </Button>
  )
}
