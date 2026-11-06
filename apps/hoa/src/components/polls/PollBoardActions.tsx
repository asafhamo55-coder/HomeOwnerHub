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

function homesPhrase(n: number | null): string {
  if (n === null) return 'the homes with an email address on file'
  return `${n} ${n === 1 ? 'home' : 'homes'}`
}

export function PollBoardActions({
  id,
  status,
  resultsEmailed = false,
  openedEmailed = false,
  emailHomes = null,
}: {
  id: string
  status: PollStatus
  /** The results email already went out (by the board or the daily job). */
  resultsEmailed?: boolean
  /** The board emailed this poll when it opened it (the opened email exists and was not held). */
  openedEmailed?: boolean
  /** Homes an email would reach now; null when it could not be counted. */
  emailHomes?: number | null
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<PollEmailMessage | null>(null)
  const [emailOpen, setEmailOpen] = useState(true)
  // Default follows what the board chose at open: no email then, none now unless they tick it.
  const [emailResults, setEmailResults] = useState(openedEmailed)
  const [confirming, setConfirming] = useState<'open' | 'close' | null>(null)

  function run(
    fn: (id: string) => Promise<PollActionResult>,
    after: () => void,
    emailKind?: 'opened' | 'results',
  ) {
    setError(null)
    setNotice(null)
    setConfirming(null)
    start(async () => {
      const r = await fn(id)
      if (!r.ok) return setError(r.error ?? 'Something went wrong.')
      if (emailKind && r.email) setNotice(pollEmailMessage(emailKind, r.email))
      after()
    })
  }

  const doOpen = (email: boolean) =>
    run((pollId) => openPollAction(pollId, { emailResidents: email }), () => router.refresh(), 'opened')
  const doClose = (email: boolean) =>
    run((pollId) => closePollAction(pollId, { emailResidents: email }), () => router.refresh(), 'results')

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
        <div className="space-y-2">
          <EmailCheckbox
            checked={emailResults}
            onChange={setEmailResults}
            disabled={pending}
            label="Email residents the results"
            hint="Each home gets the results with a bar for every answer, counted by home and never by name."
          />
          {!openedEmailed ? <p className="text-base text-foreground-secondary">You did not email this poll when you opened it.</p> : null}
        </div>
      ) : null}

      {confirming ? (
        <div role="group" aria-label="Confirm email" className="space-y-3 rounded-xl border border-border bg-subtle p-4">
          <p className="text-base font-semibold text-foreground">This will email {homesPhrase(emailHomes)}.</p>
          <p className="text-base text-foreground-secondary">
            {confirming === 'open'
              ? 'Residents who turned off email are skipped. "Don’t email" still opens the poll.'
              : 'Residents who turned off email are skipped. "Don’t email" still closes the poll.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" disabled={pending} onClick={() => (confirming === 'open' ? doOpen(true) : doClose(true))}>
              Send
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={pending}
              onClick={() => (confirming === 'open' ? doOpen(false) : doClose(false))}
            >
              Don&rsquo;t email
            </Button>
            <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
              Go back
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {status === 'draft' ? (
          <>
            <Button size="lg" disabled={pending || confirming !== null} onClick={() => (emailOpen ? setConfirming('open') : doOpen(false))}>
              Open for answers
            </Button>
            <Button
              size="lg"
              variant="destructive-ghost"
              disabled={pending || confirming !== null}
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
            disabled={pending || confirming !== null}
            onClick={async () => {
              if (emailResults && !resultsEmailed) return setConfirming('close')
              const ok = await confirm({
                title: 'Close this poll?',
                description: 'Residents will not be able to answer or change answers.',
                confirmLabel: 'Close the poll',
              })
              if (ok) doClose(false)
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
