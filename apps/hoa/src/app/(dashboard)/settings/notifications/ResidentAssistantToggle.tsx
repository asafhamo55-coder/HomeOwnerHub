'use client'

import { useState, useTransition } from 'react'
import { Switch, useToast } from '@homeowner-portal/ui'
import { saveResidentAssistantSettings } from '@/lib/resident-assistant/actions'

/**
 * The association-wide "Resident assistant" switch (BL-096). On unless a
 * board turns it off. Saves on change.
 */
export function ResidentAssistantToggle({ initial }: { initial: boolean }) {
  const toast = useToast()
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const res = await saveResidentAssistantSettings({ on: next })
      if (!res.ok) {
        setOn(!next)
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({
        tone: 'success',
        message: next
          ? 'Residents can chat with the resident assistant on their Ask tab.'
          : 'Resident assistant turned off. Residents see Ask the Docs instead.',
      })
    })
  }

  return (
    <Switch
      label="Resident assistant"
      description="Residents can ask, on their Ask tab, about their own balance, requests, announcements and meetings, and about your rules with cited answers. It only sees the resident’s own account and never creates anything: it offers “Ask the board” and “Start an ARC application” buttons that open a filled-in form for the resident to send. Off: residents get Ask the Docs."
      checked={on}
      disabled={pending}
      onChange={(e) => change(e.currentTarget.checked)}
    />
  )
}
