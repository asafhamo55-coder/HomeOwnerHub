'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { COMM_LANGUAGES, COMM_LANGUAGE_LABELS, type CommLanguage } from '@/lib/communications/bilingual'
import { setMyLanguage } from '@/lib/language-preference-actions'
import { Panel, SectionLabel } from '@/components/resident/screen'

/**
 * The language of messages from the association. Saves on choosing.
 * `current` null = no choice yet (messages carry both languages).
 * `loadFailed` hides the choice rather than show a state we do not know.
 */
export function MessageLanguage({
  current,
  loadFailed,
  otherOrg,
  readOnly = false,
}: {
  current: CommLanguage | null
  loadFailed: boolean
  otherOrg: boolean
  readOnly?: boolean
}) {
  const router = useRouter()
  const name = useId()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function choose(next: CommLanguage) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await setMyLanguage(next)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section className="space-y-2.5" aria-labelledby="msg-language-heading">
      <SectionLabel>
        <span id="msg-language-heading">Message language</span>
      </SectionLabel>
      <Panel className="space-y-3">
        {loadFailed ? (
          <p className="text-sm text-danger" role="alert">
            Couldn’t load your language. Reload the page to try again.
          </p>
        ) : otherOrg ? (
          <p className="text-sm text-muted">
            Your message preferences are kept with another community on your account. Contact support to move them here.
          </p>
        ) : (
          <fieldset className="space-y-2" disabled={pending || readOnly}>
            <legend className="mb-2 text-sm font-semibold text-foreground">Send me messages in</legend>
            {COMM_LANGUAGES.map((code) => (
              <label
                key={code}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              >
                <input
                  type="radio"
                  name={name}
                  value={code}
                  checked={current === code}
                  onChange={() => choose(code)}
                  className="h-5 w-5 accent-primary"
                />
                <span lang={code}>{COMM_LANGUAGE_LABELS[code]}</span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-xs text-muted">
          {current
            ? 'When your association sends a message in both languages, you get this one.'
            : 'You haven’t chosen yet, so messages that come in two languages arrive with both.'}{' '}
          Messages the association writes in one language only stay as written.
        </p>
        <p className="text-xs text-muted" role="status">
          {saved ? 'Saved.' : ''}
        </p>
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
