'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquareText } from 'lucide-react'
import { Alert, Button, Checkbox, useToast } from '@homeowner-portal/ui'
import { optInToTexts, optOutOfTexts } from '@/lib/sms-consent-actions'
import { Panel, SectionLabel } from '@/components/resident/screen'
import type { TextMessagesState } from '@/lib/sms-consent'

/**
 * BL-110: the resident's own agreement to text messages. The box starts
 * unticked; the disclosure (rendered verbatim from the server, which
 * hashes the same words) names the association, frequency, rates,
 * STOP / HELP and the privacy policy; the numbers texts go to are listed
 * above it. Stopping is one click.
 */

export function TextMessages({ state, readOnly = false }: { state: TextMessagesState | 'failed'; readOnly?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (!res.ok) {
        setError(res.error)
        return
      }
      setAgreed(false)
      toast({ tone: 'success', message: done })
      router.refresh()
    })
  }

  return (
    <section id="text-messages" className="scroll-mt-20 space-y-2.5" aria-labelledby="texts-heading">
      <SectionLabel>
        <span id="texts-heading">Text messages</span>
      </SectionLabel>
      <Panel className="space-y-3">
        {state === 'failed' ? (
          <Alert variant="error" title="Couldn’t load your text preference">
            Reload the page to try again. Until then you won’t get texts from your association.
          </Alert>
        ) : state.optIn ? (
          <>
            <p className="flex items-start gap-2 text-sm text-foreground">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span>
                Texts are on
                {state.since ? ` since ${new Date(state.since).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
                {state.phones.length > 0 ? ` — sent to ${state.phones.join(' and ')}.` : '.'}
              </span>
            </p>
            <Button
              variant="secondary"
              onClick={() => run(optOutOfTexts, 'Texts are off')}
              disabled={pending || readOnly}
            >
              Stop text messages
            </Button>
            <p className="text-xs text-muted">This takes effect right away. You can also reply STOP to any text.</p>
          </>
        ) : state.otherOrg ? (
          <p className="text-sm text-muted">
            Your text preference is kept with another community on your account. Contact support to move it here.
          </p>
        ) : state.phones.length === 0 ? (
          <p className="text-sm text-muted">
            Texts are off. To get urgent notices by text, first add your mobile number under My contact details above —
            once your board has it on file, you can turn texts on here.
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!agreed) return
              run(
                () =>
                  optInToTexts({
                    agreed,
                    disclosureVersion: state.disclosureVersion,
                    disclosureSha256: state.disclosureSha256,
                    phonesFingerprint: state.phonesFingerprint,
                  }),
                'Texts are on',
              )
            }}
          >
            <p className="text-sm text-foreground">
              Texts are off. Get urgent notices and reminders by text at{' '}
              <span className="font-semibold">{state.phones.join(' and ')}</span>.
            </p>
            <p className="text-xs text-muted">Not your mobile number? Change it under My contact details above first.</p>
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={pending || readOnly}
              label="I agree to receive text messages"
              description={
                <>
                  {state.disclosure.replace(/\s*Privacy policy: \S+$/, '')}{' '}
                  <a href={state.privacyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
                    Privacy policy
                  </a>
                </>
              }
            />
            <Button type="submit" disabled={!agreed || pending || readOnly}>
              Turn on text messages
            </Button>
          </form>
        )}
        {readOnly ? <p className="text-xs text-muted">You’re viewing as this resident — only they can change this.</p> : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </Panel>
    </section>
  )
}
