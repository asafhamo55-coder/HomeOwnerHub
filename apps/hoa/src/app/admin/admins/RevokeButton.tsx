'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { revokePlatformAdmin } from '@/lib/platform-admin'

export function RevokeButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: 'Revoke platform-admin access?',
      description: `${email} loses access to every platform-admin tool immediately.`,
      confirmLabel: 'Revoke access',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const result = await revokePlatformAdmin(userId)
      if (!result.ok) {
        toast({ tone: 'error', title: 'Couldn’t revoke access', message: result.error })
        return
      }
      toast({ tone: 'success', message: `Revoked platform-admin access for ${email}.` })
      router.refresh()
    })
  }

  return (
    <Button variant="destructive-ghost" size="sm" onClick={handleClick} loading={isPending}>
      Revoke
    </Button>
  )
}
