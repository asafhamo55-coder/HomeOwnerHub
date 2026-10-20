'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MessageSquareText, X } from 'lucide-react'
import { Panel } from '@/components/resident/screen'

/**
 * BL-110: an optional nudge on the resident home for someone with a
 * mobile number on file who hasn't agreed to texts. It only points to
 * Account → Text messages, where the actual agreement happens — nothing
 * here opts anyone in. Dismissal is per browser (localStorage).
 */
const KEY = 'hh:texts-prompt-dismissed'

export function TextsPromptCard() {
  // Start hidden so a dismissed card never flashes on load.
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(KEY) !== '1')
    } catch {
      setShow(true)
    }
  }, [])
  if (!show) return null

  function dismiss() {
    setShow(false)
    try {
      window.localStorage.setItem(KEY, '1')
    } catch {
      // Storage blocked: the card simply comes back next visit.
    }
  }

  return (
    <Panel className="flex items-start gap-3">
      <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-foreground">Get urgent notices by text</p>
        <p className="text-sm text-muted">
          Water shut-offs, gate outages and other urgent news reach you faster by text. It’s off until you agree.
        </p>
        <Link href="/resident/account#text-messages" className="inline-block text-sm font-medium text-primary">
          Set up text messages
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-m-1 rounded-md p-1 text-muted hover:bg-subtle hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </Panel>
  )
}
