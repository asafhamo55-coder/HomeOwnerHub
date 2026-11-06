'use client'

import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

export function PrintButton() {
  return (
    <Button type="button" icon={<Printer aria-hidden />} onClick={() => window.print()}>
      Print this notice
    </Button>
  )
}
