'use client'

import { useState, useTransition } from 'react'
import { Switch, useToast } from '@homeowner-portal/ui'
import { saveResidentAssistantSettings } from '@/lib/resident-assistant/actions'

/**
 * One association's "Resident assistant" switch (BL-096). Off until a board
 * turns it on (SEC-002: a missing setting reads OFF). While it has never
 * been saved it shows "Recommended: turn on"; nothing is saved until the
 * board flips it. Saves on change, for this association only (SEC-003).
 */
export function ResidentAssistantToggle({
  associationId,
  associationName,
  initial,
  recommendOn,
}: {
  associationId: string
  /** Shown in the label when the org has more than one association. */
  associationName?: string
  initial: boolean
  recommendOn: boolean
}) {
  const toast = useToast()
  const [on, setOn] = useState(initial)
  const [saved, setSaved] = useState(!recommendOn)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const res = await saveResidentAssistantSettings({ associationId, on: next })
      if (!res.ok) {
        setOn(!next)
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      setSaved(true)
      toast({
        tone: 'success',
        message: next
          ? 'Residents can chat with the resident assistant on their Ask tab.'
          : 'Resident assistant turned off. Residents see Ask the Docs instead.',
      })
    })
  }

  return (
    <div className="space-y-1.5">
      <Switch
        label={associationName ? `Resident assistant — ${associationName}` : 'Resident assistant'}
        description="Residents can ask, on their Ask tab, about their own balance, requests, announcements and meetings, and about your rules with cited answers. It only sees the resident’s own account and never creates anything: it offers “Ask the board” and “Start an ARC application” buttons that open a filled-in form for the resident to send. Off: residents get Ask the Docs."
        checked={on}
        disabled={pending}
        onChange={(e) => change(e.currentTarget.checked)}
      />
      {!saved && !on ? <p className="text-xs font-medium text-accent-fg">Recommended: turn on</p> : null}
    </div>
  )
}
