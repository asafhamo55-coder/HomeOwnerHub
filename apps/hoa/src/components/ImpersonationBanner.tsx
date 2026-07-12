'use client'

import { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { exitResidentPortal } from '@/lib/impersonation-actions'

// Persistent banner shown at the top of the resident portal while an admin
// is impersonating an owner. Read-only reminder + an Exit control that
// clears the impersonation cookie and returns to the property page.
export function ImpersonationBanner({ name }: { name: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Alert variant="warning" title={`Viewing ${name}'s portal as an admin`} className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Read-only — resident actions are disabled while impersonating.
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(() => void exitResidentPortal())}
        >
          <LogOut className="h-3.5 w-3.5" />
          {pending ? 'Exiting…' : 'Exit'}
        </Button>
      </div>
    </Alert>
  )
}
