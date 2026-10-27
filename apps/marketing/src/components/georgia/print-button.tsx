'use client'

import { Printer } from 'lucide-react'

export function PrintButtonClient({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-secondary print:hidden">
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}
