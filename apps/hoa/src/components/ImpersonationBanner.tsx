'use client'

import { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { exitResidentPortal } from '@/lib/impersonation-actions'

// Persistent, in-flow banner at the top of the resident portal while an
// admin is impersonating an owner. Read-only reminder + an Exit control that
// clears the impersonation cookie and returns to the property page.
export function ImpersonationBanner({ name }: { name: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Alert
      variant="warning"
      title={`Viewing ${name}'s portal as an admin`}
      className="mb-5"
      actions={
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          icon={<LogOut aria-hidden />}
          onClick={() => startTransition(() => void exitResidentPortal())}
        >
          Exit
        </Button>
      }
    >
      Read-only — resident actions are disabled while impersonating.
    </Alert>
  )
}
