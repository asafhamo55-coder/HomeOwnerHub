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

  function agreeForm(lead: string, submitLabel: string) {
    if (state === 'failed') return null
    const s = state
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!agreed) return
          run(
            () =>
              optInToTexts({
                agreed,
                disclosureVersion: s.disclosureVersion,
                disclosureSha256: s.disclosureSha256,
                phonesFingerprint: s.phonesFingerprint,
              }),
            'Texts are on',
          )
        }}
      >
        <p className="text-sm text-foreground">
          {lead}{' '}
          <span className="font-semibold">{s.phones.join(' and ')}</span>.
        </p>
        <p className="text-xs text-muted">Not your mobile number? Change it under My contact details above first.</p>
        <Checkbox
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={pending || readOnly}
          label="I agree to receive text messages"
          description={
            <>
              {s.disclosure.replace(/\s*Privacy policy: \S+$/, '')}{' '}
              <a href={s.privacyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
                Privacy policy
              </a>
            </>
          }
        />
        <Button type="submit" disabled={!agreed || pending || readOnly}>
          {submitLabel}
        </Button>
      </form>
    )
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
        ) : state.optIn && (state.consentGap === 'number_changed' || state.consentGap === 'no_record') ? (
          <>
            {/* BL-111: consent covers the numbers the resident agreed for.
                A number on file that isn't covered gets no texts until
                they agree again. */}
            <Alert
              variant="warning"
              title={state.consentGap === 'number_changed' ? 'Your number changed — agree again to get texts' : 'Agree again to keep getting texts'}
            >
              {state.consentGap === 'number_changed'
                ? 'Your agreement covers the number you had when you agreed. We won’t text your new number until you agree for it below.'
                : 'We need your agreement on file for this number. Until you agree below, we won’t text you.'}
            </Alert>
            {agreeForm('Agree to get texts at', 'Agree and keep texts on')}
            <Button
              variant="secondary"
              onClick={() => run(optOutOfTexts, 'Texts are off')}
              disabled={pending || readOnly}
            >
              Stop text messages
            </Button>
          </>
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
          agreeForm(`Texts are off. Get urgent notices and reminders by text at`, 'Turn on text messages')
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
