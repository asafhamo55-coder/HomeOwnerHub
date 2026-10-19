'use client'

import { useState, useTransition } from 'react'
import { Switch, useToast } from '@homeowner-portal/ui'
import { saveResidentNotifySettings } from '@/lib/resident-notify/actions'

/**
 * The association-wide "Tell residents about decisions and replies" switch
 * (BL-082). Off until a board turns it on. Saves on change.
 */
export function ResidentNotifyToggle({ initial }: { initial: boolean }) {
  const toast = useToast()
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const res = await saveResidentNotifySettings({ on: next })
      if (!res.ok) {
        setOn(!next)
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({
        tone: 'success',
        message: next
          ? 'Residents will be told when the board decides or replies.'
          : 'Resident decision and reply notices turned off.',
      })
    })
  }

  return (
    <Switch
      label="Tell residents about decisions and replies"
      description="When the board approves, denies or asks for more information on an ARC application, or replies to a request (internal notes never), the resident who sent it gets an email — and a text if they opted in to texts."
      checked={on}
      disabled={pending}
      onChange={(e) => change(e.currentTarget.checked)}
    />
  )
}
