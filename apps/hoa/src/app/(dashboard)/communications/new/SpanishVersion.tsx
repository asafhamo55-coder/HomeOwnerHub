'use client'

import { useEffect, useState } from 'react'
import { Languages, RefreshCw, X } from 'lucide-react'
import { Alert, Button, Checkbox, Field, Input, Textarea } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'

/**
 * BL-025 — "Add Spanish version". The draft comes from W31's translation
 * step (POST /api/ai/translate-communication); the board reads it, can edit
 * it, and has to tick "I've read the Spanish version" before the wizard will
 * send. If the English changes afterwards, the tick is cleared.
 */
export interface SpanishDraft {
  subject: string
  bodyHtml: string
  /** True once the board confirmed reading it against `sourceKey`. */
  viewed: boolean
  /** The English (subject + body) this draft was translated or confirmed against. */
  sourceKey: string
}

export function englishKey(subject: string, bodyHtml: string): string {
  return `${subject.trim()}\n${bodyHtml.trim()}`
}

export function SpanishVersion({
  subject,
  bodyHtml,
  value,
  onChange,
  disabled,
  error,
}: {
  subject: string
  bodyHtml: string
  value: SpanishDraft | null
  onChange: (next: SpanishDraft | null) => void
  disabled?: boolean
  error?: string
}) {
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const currentKey = englishKey(subject, bodyHtml)
  const englishReady = subject.trim() !== '' && bodyHtml.trim() !== ''
  const stale = value !== null && value.sourceKey !== currentKey

  // The English changed after the board confirmed the Spanish: confirm again.
  useEffect(() => {
    if (value && value.viewed && value.sourceKey !== currentKey) onChange({ ...value, viewed: false })
  }, [value, currentKey, onChange])

  async function translate() {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/ai/translate-communication', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), bodyHtml: bodyHtml.trim() }),
      })
      if (!res.ok) throw new Error(await responseErrorMessage(res, `Translation failed (${res.status}).`))
      const data = (await res.json().catch(() => null)) as { subject?: unknown; bodyHtml?: unknown } | null
      if (!data || typeof data.subject !== 'string' || typeof data.bodyHtml !== 'string') {
        throw new Error('Translation failed. Try again.')
      }
      onChange({ subject: data.subject, bodyHtml: data.bodyHtml, viewed: false, sourceKey: currentKey })
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Translation failed.')
    } finally {
      setLoading(false)
    }
  }

  if (!value) {
    return (
      <section className="space-y-2 rounded-lg border border-border bg-subtle/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Spanish version</h3>
            <p className="text-xs text-muted">
              Optional. AI drafts a Spanish translation; you read and edit it before sending.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Languages aria-hidden />}
            onClick={translate}
            loading={loading}
            disabled={disabled || !englishReady}
          >
            Add Spanish version
          </Button>
        </div>
        {!englishReady ? <p className="text-xs text-muted">Write the subject and body first.</p> : null}
        {fetchError ? <Alert variant="error">{fetchError}</Alert> : null}
      </section>
    )
  }

  return (
    <section lang="es" className="space-y-4 rounded-lg border border-border bg-subtle/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Spanish version (Español)</h3>
          <p className="text-xs text-muted" lang="en">
            AI draft. Residents get the English first, then this under an “Español” heading.
          </p>
        </div>
        <div className="flex gap-2" lang="en">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RefreshCw aria-hidden />}
            onClick={translate}
            loading={loading}
            disabled={disabled || !englishReady}
          >
            Translate again
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<X aria-hidden />}
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            Remove
          </Button>
        </div>
      </div>

      {stale ? (
        <Alert variant="warning" lang="en">
          The English changed after this was translated. Translate again, or update the Spanish yourself, then
          confirm below.
        </Alert>
      ) : null}
      {fetchError ? <Alert variant="error" lang="en">{fetchError}</Alert> : null}

      <Field label="Asunto (Spanish subject)" required>
        <Input
          type="text"
          value={value.subject}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
          disabled={disabled}
        />
      </Field>
      <Field label="Mensaje (Spanish body)" required hint="HTML. Keep the {{ variables }} exactly as they are.">
        <Textarea
          value={value.bodyHtml}
          onChange={(e) => onChange({ ...value, bodyHtml: e.target.value })}
          disabled={disabled}
          rows={10}
          className="font-mono text-xs sm:text-xs"
        />
      </Field>

      <div lang="en">
        <Checkbox
          checked={value.viewed}
          onChange={(e) => onChange({ ...value, viewed: e.target.checked, sourceKey: currentKey })}
          disabled={disabled}
          label="I've read the Spanish version"
          description="Required before sending. Check names, dates and amounts against the English."
          error={Boolean(error)}
        />
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}
