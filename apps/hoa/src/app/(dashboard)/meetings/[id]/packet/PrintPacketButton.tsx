'use client'

import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/**
 * Opens the browser's print dialog; "Save as PDF" lives there in Safari.
 * The light palette on paper comes from the design-system preset's
 * `@media print` block, so ⌘P from the menu prints the same as this.
 * The packet is never emailed from the product (BL-016 risk note).
 */
export function PrintPacketButton() {
  return (
    <Button type="button" icon={<Printer aria-hidden />} onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  )
}
