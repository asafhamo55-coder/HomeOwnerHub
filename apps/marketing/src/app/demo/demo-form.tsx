'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { pageLabel, trackEvent } from '../../lib/analytics'
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { submitDemoRequest, type DemoRequestState } from './actions'
import { cn } from '../../lib/cn'

const initial: DemoRequestState = { status: 'idle' }

// Shape check only (text, one at sign, a dotted domain). The server stays the authority and
// uses the same message, so a field never flips wording on submit.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const EMAIL_SHAPE_MESSAGE = 'That email doesn\'t look right.'
function checkEmail(v: string): string | undefined {
  const t = v.trim()
  return t && !EMAIL_SHAPE.test(t) ? EMAIL_SHAPE_MESSAGE : undefined
}

export function DemoForm() {
  const [state, formAction, pending] = useActionState(submitDemoRequest, initial)
  const pathname = usePathname()
  const formRef = useRef<HTMLFormElement>(null)

  // One event per successful submit. No form values are sent: labels only.
  useEffect(() => {
    if (state.status === 'success') void trackEvent('demo_submit_success', { page: pageLabel(pathname) })
  }, [state.status, pathname])

  // Move focus to the first invalid field after a failed submit, so keyboard
  // and screen-reader users land on the problem instead of the page top.
  useEffect(() => {
    if (state.status !== 'error') return
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (first) first.focus()
    else formRef.current?.querySelector<HTMLElement>('[data-form-error]')?.focus()
  }, [state])

  if (state.status === 'success') {
    return (
      <div className="mt-8 rounded-xl border border-success/25 bg-success-subtle/40 p-6" role="status">
        <CheckCircle2 className="h-9 w-9 text-success" aria-hidden />
        <h3 className="mt-3 text-lg font-semibold text-foreground">Got it. We&apos;ll reply within 1 business day.</h3>
        <p className="mt-3 text-sm font-semibold text-foreground">What happens next</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground-secondary">
          <li>We email you to find a time that suits your board.</li>
          <li>Reply with your CC&amp;R and bylaws as PDFs. We load them before the call so the demo runs on your rules.</li>
          <li>We show you the product on your documents. Your board decides afterwards. No pressure, no auto-conversion.</li>
        </ol>
        <p className="mt-4 text-sm text-foreground-secondary">
          While you wait, the{' '}
          <a href="/georgia/readiness" className="font-semibold text-primary underline-offset-2 hover:underline">
            free SB 406 readiness check
          </a>{' '}
          takes about three minutes.
        </p>
      </div>
    )
  }

  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {}
  const values = state.status === 'error' ? state.values ?? {} : {}

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-4">
      {/* Honeypot — hidden from humans, irresistible to bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website (leave blank)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field label="Your name" name="name" type="text" autoComplete="name" required value={values.name} error={errors.name} />
      <Field label="Email" name="email" type="email" autoComplete="email" required value={values.email} error={errors.email} validate={checkEmail} />
      <Field
        label="HOA or community name"
        name="hoa"
        placeholder="Your association’s name"
        autoComplete="organization"
        required
        value={values.hoa}
        error={errors.hoa}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="County (optional)" name="county" placeholder="Fulton" value={values.county} error={errors.county} />
        <Field
          label="Number of homes (optional)"
          name="homes"
          type="text"
          inputMode="numeric"
          placeholder="120"
          value={values.homes}
          error={errors.homes}
        />
      </div>

      {state.status === 'error' && !Object.keys(errors).length && (
        <div
          role="alert"
          tabIndex={-1}
          data-form-error
          className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-subtle/60 p-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="btn btn-primary btn-lg w-full disabled:opacity-70"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Sending…
          </>
        ) : (
          <>
            Request demo
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </button>
      <p className="text-center text-sm text-muted">
        We reply within 1 business day. No spam, ever.
      </p>
    </form>
  )
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required,
  error,
  inputMode,
  autoComplete,
  value,
  validate,
}: {
  label: string
  name: string
  inputMode?: 'numeric' | 'text'
  autoComplete?: string
  value?: string
  type?: string
  placeholder?: string
  required?: boolean
  error?: string
  validate?: (value: string) => string | undefined
}) {
  // Client-side check on blur; cleared as soon as the value is fixed.
  const [localError, setLocalError] = useState<string>()
  const shown = localError ?? error
  return (
    <div>
      <label className="text-sm font-semibold text-foreground" htmlFor={name}>
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        defaultValue={value}
        onBlur={validate ? (e) => setLocalError(validate(e.currentTarget.value)) : undefined}
        onChange={
          validate
            ? (e) => {
                if (localError && !validate(e.currentTarget.value)) setLocalError(undefined)
              }
            : undefined
        }
        aria-invalid={Boolean(shown)}
        aria-describedby={shown ? `${name}-error` : undefined}
        className={cn(
          'mt-1.5 min-h-12 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2',
          shown
            ? 'border-danger/40 focus:border-danger focus:ring-danger/15'
            : 'border-input focus:border-primary focus:ring-primary/20',
        )}
      />
      {shown && (
        <p id={`${name}-error`} className="mt-1 text-sm text-danger">
          {shown}
        </p>
      )}
    </div>
  )
}

