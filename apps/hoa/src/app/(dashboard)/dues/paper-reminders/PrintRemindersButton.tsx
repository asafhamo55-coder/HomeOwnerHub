'use client'

import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

export function PrintRemindersButton({ count }: { count: number }) {
  return (
    <Button type="button" icon={<Printer aria-hidden />} onClick={() => window.print()} className="min-h-11">
      {count === 1 ? 'Print 1 reminder' : `Print ${count} reminders`}
    </Button>
  )
}
