'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Mail, Phone } from 'lucide-react'
import { Button, cn } from '@homeowner-portal/ui'
import { mailtoHref, telHref } from '@/lib/contact-links'

/**
 * A phone number or email address as a tap-to-call / tap-to-email link,
 * with a copy button beside it. Text that isn't a dialable number or a
 * plausible address stays plain text (still copyable): a link that dials
 * nonsense is worse than none.
 */
export function ContactLink({
  kind,
  value,
  className,
  showIcon = false,
}: {
  kind: 'phone' | 'email'
  value: string
  className?: string
  /** Leading phone/mail glyph, for places where the label isn't shown. */
  showIcon?: boolean
}) {
  const href = kind === 'phone' ? telHref(value) : mailtoHref(value)
  const Icon = kind === 'phone' ? Phone : Mail
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-0.5', className)}>
      {href ? (
        <a
          href={href}
          className="inline-flex min-w-0 items-center gap-1.5 truncate text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showIcon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
          <span className="truncate">{value}</span>
        </a>
      ) : (
        <span className="truncate">{value}</span>
      )}
      <CopyIconButton value={value} label={kind === 'phone' ? `Copy phone ${value}` : `Copy email ${value}`} />
    </span>
  )
}

function CopyIconButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={copy}
        aria-label={label}
        title={state === 'failed' ? 'Couldn’t copy — select the text instead' : 'Copy'}
        icon={state === 'copied' ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
        className="shrink-0 text-muted"
      />
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : ''}
      </span>
    </>
  )
}
