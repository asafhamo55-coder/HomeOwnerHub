'use client'

import { useTransition } from 'react'
import { LogIn } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
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
  const toast = useToast()
  if (!email) return null

  const label = name || email

  return (
    <Button
      size="sm"
      variant={variant}
      disabled={pending}
      title={`Enter ${label}'s portal (read-only)`}
      onClick={() =>
        startTransition(async () => {
          // Success redirects; a refusal (owner not in this org) returns.
          const result = await enterResidentPortal({ email, name: label, propertyId, unitId, ownerUserId })
          if (result && !result.ok) {
            toast({ tone: 'error', title: 'Couldn’t open the owner portal', message: result.error })
          }
        })
      }
    >
      <LogIn className="h-3.5 w-3.5" />
      {pending ? 'Entering…' : 'Enter portal'}
    </Button>
  )
}
