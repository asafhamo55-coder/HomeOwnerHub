'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, UserPlus } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { inviteMember } from '@/lib/members'

/**
 * "Invite to portal" for an owner of this home: the existing member invite
 * (lib/members.ts inviteMember, role resident, linked to this home as
 * owner). Nothing is sent until the board confirms — the invite is a real
 * email with a sign-in link. A buyer recorded by a sale gets their sale
 * ownership linked (keeping its settlement date), not a second one.
 */
export function InviteToPortalButton({
  propertyId,
  name,
  email,
  variant = 'secondary',
}: {
  propertyId: string
  name: string | null
  email: string
  variant?: 'secondary' | 'ghost'
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()
  const who = name || email

  async function invite() {
    const ok = await confirm({
      title: `Invite ${who} to the portal?`,
      description: `We’ll email ${email} a sign-in link. They’ll see this home’s notices, and dues from their ownership on.`,
      confirmLabel: 'Send invite',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await inviteMember({ email, role: 'resident', fullName: name, propertyId, residencyRole: 'owner' })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Couldn’t send the invite', message: 'Check the email address and try again.' })
        return
      }
      setSent(true)
      toast({ tone: 'success', message: res.data.alreadyExisted ? `${who} already had an account; it’s now linked to this home.` : `Invite sent to ${email}.` })
      router.refresh()
    })
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <Check aria-hidden className="size-3.5" />
        Invited
      </span>
    )
  }
  return (
    <Button type="button" size="sm" variant={variant} icon={<UserPlus aria-hidden />} loading={pending} onClick={() => void invite()}>
      Invite to portal
    </Button>
  )
}
