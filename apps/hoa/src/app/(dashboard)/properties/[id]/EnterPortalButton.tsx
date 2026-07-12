'use client'

import { useTransition } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { enterResidentPortal } from '@/lib/impersonation-actions'

// Admin-only control: enter the owner's resident portal to see exactly what
// they see (read-only). Server action resolves the owner's auth identity and
// redirects to /resident. Renders nothing without an email to key on.
export function EnterPortalButton({
  email,
  name,
  propertyId,
  unitId,
  ownerUserId,
  variant = 'outline',
}: {
  email: string | null
  name: string | null
  propertyId: string
  unitId: string | null
  ownerUserId?: string | null
  variant?: 'outline' | 'ghost' | 'default'
}) {
  const [pending, startTransition] = useTransition()
  if (!email) return null

  const label = name || email

  return (
    <Button
      size="sm"
      variant={variant}
      disabled={pending}
      title={`Enter ${label}'s portal (read-only)`}
      onClick={() =>
        startTransition(() =>
          void enterResidentPortal({ email, name: label, propertyId, unitId, ownerUserId }),
        )
      }
    >
      <LogIn className="h-3.5 w-3.5" />
      {pending ? 'Entering…' : 'Enter portal'}
    </Button>
  )
}
