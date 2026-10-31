'use client'

import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'

/**
 * Minimum password length. Mirror this with the Supabase project policy
 * (Auth → Policies → min length). Client checks are UX only; the server is
 * the real gate.
 */
export const MIN_PASSWORD = 10

/**
 * Auth screens only: lifts Field's hint, error and "Forgot password?" lines
 * from text-xs to text-sm, for people on large-text phones.
 */
export const AUTH_FIELD_CLASS = '[&_p]:!text-sm [&>div:first-child>div]:!text-sm'

/** A deliberately loose shape check — the server decides what is valid. */
export function emailProblem(raw: string): string | null {
  const v = raw.trim()
  if (!v) return 'Enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'That doesn’t look like an email address.'
  return null
}

/**
 * Live password rules. Each rule is a glyph AND words, and the list is
 * announced politely as it changes, so it never relies on colour.
 */
export function PasswordRules({
  password,
  confirm,
  id,
}: {
  password: string
  /** Pass to also show a "passwords match" rule. */
  confirm?: string
  id?: string
}) {
  const rules = [
    { ok: password.length >= MIN_PASSWORD, label: `At least ${MIN_PASSWORD} characters` },
    ...(confirm !== undefined
      ? [{ ok: password.length > 0 && password === confirm, label: 'Both passwords match' }]
      : []),
  ]
  return (
    <ul id={id} className="space-y-1 text-sm" aria-live="polite">
      {rules.map((r) => (
        <li key={r.label} className={cn('flex items-center gap-1.5', r.ok ? 'text-success' : 'text-muted')}>
          {r.ok ? <Check className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
          <span>
            {r.label}
            <span className="sr-only">{r.ok ? ' — done' : ' — not yet'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "Or" divider between alternative actions. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm uppercase tracking-[0.08em] text-muted" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Show/hide password button: a 44px target, labelled in words for screen readers. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="-my-2 -mr-2 inline-flex size-11 items-center justify-center rounded-md text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
    >
      {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
    </button>
  )
}
