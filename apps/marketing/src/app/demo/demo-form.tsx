'use client'

import { useActionState } from 'react'
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { submitDemoRequest, type DemoRequestState } from './actions'
import { cn } from '@/lib/cn'

const initial: DemoRequestState = { status: 'idle' }

export function DemoForm() {
  const [state, formAction, pending] = useActionState(submitDemoRequest, initial)

  if (state.status === 'success') {
    return (
      <div className="mt-8 rounded-xl border border-success/25 bg-success-subtle/40 p-6 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
        <h3 className="mt-3 text-base font-semibold text-foreground">Got it. Talk soon.</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
          We'll reach out within one business day with a calendar link and a
          short doc-upload form for your CC&R.
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
        placeholder="Madison Park HOA"
        required
        error={errors.hoa}
      />

      {state.status === 'error' && !Object.keys(errors).length && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-subtle/60 p-3 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg shadow-sm transition-all hover:bg-primary-hover disabled:opacity-70"
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
        We reply within one business day. No spam, ever.
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
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
  error?: string
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-foreground-secondary" htmlFor={name}>
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        className={cn(
          'mt-1.5 w-full rounded-xl border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2',
          error
            ? 'border-danger/40 focus:border-danger focus:ring-danger/15'
            : 'border-border focus:border-primary focus:ring-primary/15',
        )}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

