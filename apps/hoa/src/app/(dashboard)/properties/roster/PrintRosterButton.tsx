'use client'

import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/** Opens the print dialog; "Save as PDF" lives there. App chrome never prints. */
export function PrintRosterButton() {
  return (
    <Button type="button" variant="secondary" icon={<Printer aria-hidden />} onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  )
}
