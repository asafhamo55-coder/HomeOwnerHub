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
      <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50/40 p-6 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
        <h3 className="mt-3 text-base font-semibold text-ink-900">Got it. Talk soon.</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
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
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-ink-800 disabled:opacity-70"
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
      <p className="text-center text-xs text-ink-500">
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
      <label className="text-xs font-semibold text-ink-700" htmlFor={name}>
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        className={cn(
          'mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2',
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
            : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100',
        )}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  )
}

