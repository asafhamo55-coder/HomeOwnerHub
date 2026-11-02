'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@homeowner-portal/ui'
import { closePollAction, deletePollAction, openPollAction } from '@/lib/polls/actions'
import type { PollStatus } from '@/lib/polls/rules'

export function PollBoardActions({ id, status }: { id: string; status: PollStatus }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>, after: () => void) {
    setError(null)
    start(async () => {
      const r = await fn(id)
      if (!r.ok) return setError(r.error ?? 'Something went wrong.')
      after()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {status === 'draft' ? (
          <>
            <Button size="lg" disabled={pending} onClick={() => run(openPollAction, () => router.refresh())}>
              Open for answers
            </Button>
            <Button
              size="lg"
              variant="destructive-ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm('Delete this draft?')) run(deletePollAction, () => router.push('/polls'))
              }}
            >
              Delete draft
            </Button>
          </>
        ) : null}
        {status === 'open' ? (
          <Button
            size="lg"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (window.confirm('Close this poll? Residents will not be able to answer or change answers.')) {
                run(closePollAction, () => router.refresh())
              }
            }}
          >
            Close the poll
          </Button>
        ) : null}
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
