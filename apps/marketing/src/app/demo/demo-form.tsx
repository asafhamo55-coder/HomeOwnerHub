'use client'

import { useActionState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { pageLabel, trackEvent } from '@/lib/analytics'
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { submitDemoRequest, type DemoRequestState } from './actions'
import { cn } from '@/lib/cn'

const initial: DemoRequestState = { status: 'idle' }

export function DemoForm() {
  const [state, formAction, pending] = useActionState(submitDemoRequest, initial)
  const pathname = usePathname()

  // One event per successful submit. No form values are sent: labels only.
  useEffect(() => {
    if (state.status === 'success') void trackEvent('demo_submit_success', { page: pageLabel(pathname) })
  }, [state.status, pathname])

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

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {/* Honeypot — hidden from humans, irresistible to bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website (leave blank)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field label="Your name" name="name" type="text" required error={errors.name} />
      <Field label="Email" name="email" type="email" required error={errors.email} />
      <Field
        label="HOA or community name"
        name="hoa"
        placeholder="Your association’s name"
        required
        error={errors.hoa}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="County (optional)" name="county" placeholder="Fulton" error={errors.county} />
        <Field
          label="Number of homes (optional)"
          name="homes"
          type="text"
          inputMode="numeric"
          placeholder="120"
          error={errors.homes}
        />
      </div>

      {state.status === 'error' && !Object.keys(errors).length && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-subtle/60 p-3 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-lg w-full disabled:opacity-70"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            Request demo
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      <p className="text-center text-xs text-muted">
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
}: {
  label: string
  name: string
  inputMode?: 'numeric' | 'text'
  type?: string
  placeholder?: string
  required?: boolean
  error?: string
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-foreground" htmlFor={name}>
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        className={cn(
          'mt-1.5 min-h-12 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2',
          error
            ? 'border-danger/40 focus:border-danger focus:ring-danger/15'
            : 'border-input focus:border-primary focus:ring-primary/20',
        )}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

