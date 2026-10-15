'use client'

import { Check, Circle } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'

/**
 * Minimum password length. Mirror this with the Supabase project policy
 * (Auth → Policies → min length). Client checks are UX only; the server is
 * the real gate.
 */
export const MIN_PASSWORD = 10

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
    <ul id={id} className="space-y-1 text-xs" aria-live="polite">
      {rules.map((r) => (
        <li key={r.label} className={cn('flex items-center gap-1.5', r.ok ? 'text-success' : 'text-muted')}>
          {r.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
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
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.08em] text-muted" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
