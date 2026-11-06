'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, useConfirm } from '@homeowner-portal/ui'
import { closePollAction, deletePollAction, openPollAction, type PollActionResult } from '@/lib/polls/actions'
import { pollEmailMessage, type PollEmailMessage } from '@/lib/polls/email/messages'
import type { PollStatus } from '@/lib/polls/rules'

function EmailCheckbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
  disabled: boolean
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-base">
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        <span className="block text-foreground-secondary">{hint}</span>
      </span>
    </label>
  )
}

export function PollBoardActions({
  id,
  status,
  resultsEmailed = false,
}: {
  id: string
  status: PollStatus
  /** The results email already went out (by the board or the daily job). */
  resultsEmailed?: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<PollEmailMessage | null>(null)
  const [emailOpen, setEmailOpen] = useState(true)
  const [emailResults, setEmailResults] = useState(true)

  function run(
    fn: (id: string) => Promise<PollActionResult>,
    after: () => void,
    emailKind?: 'opened' | 'results',
  ) {
    setError(null)
    setNotice(null)
    start(async () => {
      const r = await fn(id)
      if (!r.ok) return setError(r.error ?? 'Something went wrong.')
      if (emailKind && r.email) setNotice(pollEmailMessage(emailKind, r.email))
      after()
    })
  }

  return (
    <div className="space-y-4">
      {status === 'draft' ? (
        <EmailCheckbox
          checked={emailOpen}
          onChange={setEmailOpen}
          disabled={pending}
          label="Email residents about this poll"
          hint="Each home gets the question, the answers and a button to answer. Residents who turned off email are skipped."
        />
      ) : null}
      {status === 'open' && !resultsEmailed ? (
        <EmailCheckbox
          checked={emailResults}
          onChange={setEmailResults}
          disabled={pending}
          label="Email residents the results"
          hint="Each home gets the results with a bar for every answer, counted by home and never by name."
        />
      ) : null}
      <div className="flex flex-wrap gap-3">
        {status === 'draft' ? (
          <>
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                run(
                  (pollId) => openPollAction(pollId, { emailResidents: emailOpen }),
                  () => router.refresh(),
                  'opened',
                )
              }
            >
              Open for answers
            </Button>
            <Button
              size="lg"
              variant="destructive-ghost"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete this draft?',
                  confirmLabel: 'Delete draft',
                  destructive: true,
                })
                if (ok) run(deletePollAction, () => router.push('/polls'))
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
            onClick={async () => {
              const ok = await confirm({
                title: 'Close this poll?',
                description:
                  'Residents will not be able to answer or change answers.' +
                  (emailResults && !resultsEmailed ? ' The results will be emailed to residents.' : ''),
                confirmLabel: 'Close the poll',
              })
              if (ok)
                run(
                  (pollId) => closePollAction(pollId, { emailResidents: emailResults && !resultsEmailed }),
                  () => router.refresh(),
                  'results',
                )
            }}
          >
            Close the poll
          </Button>
        ) : null}
      </div>
      {notice ? <Alert variant={notice.tone}>{notice.text}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
