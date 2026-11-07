'use client'

import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

export function PrintLabelsButton() {
  return (
    <Button type="button" icon={<Printer aria-hidden />} onClick={() => window.print()} className="min-h-11">
      Print labels
    </Button>
  )
}
