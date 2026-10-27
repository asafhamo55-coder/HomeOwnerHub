'use client'

import { m } from 'framer-motion'
import { Scale, ShieldCheck, FileText, AlertTriangle } from 'lucide-react'

export function EvictionCaseVisual() {
  return (
    <div className="bg-surface p-5">
      <div className="flex items-center gap-1.5 border-b border-border/70 pb-3">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-3 text-[10px] text-muted">Case #EV-2026-00145</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-eviction-subtle px-1.5 py-0.5 text-[9px] font-semibold text-eviction ring-1 ring-eviction/15">
          <Scale className="h-2.5 w-2.5" />
          Attorney review
        </span>
      </div>

      <div className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Case progress</p>

        <div className="mt-3 space-y-2">
          <Step delay={0} state="done" title="Tenant intake captured" sub="Riley T., 88 Ridge Rd · 11 days overdue" />
          <Step delay={0.1} state="done" title="30-day notice drafted" sub="GA OCGA Section 34-6-2 compliant" />
          <Step delay={0.2} state="active" title="Attorney review in progress" sub="Reviewed by GA counsel · 2 business days" />
          <Step delay={0.3} state="pending" title="Certified mail to tenant" sub="Auto-dispatch on approval" />
          <Step delay={0.4} state="pending" title="Court filing (demo only)" sub="Your attorney files the real document" />
        </div>

        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="relative mt-4 overflow-hidden rounded-xl border border-eviction/25 bg-eviction-subtle/40 p-3"
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-12deg] text-[36px] font-black tracking-wider text-eviction-subtle/60">
              DEMO ONLY
            </span>
          </div>
          <div className="relative">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-eviction" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-eviction">
                Bar A · Demo only
              </p>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-foreground">
              Court filing packet is generated for education. Your Georgia attorney files the real document — no exceptions.
            </p>
          </div>
        </m.div>
      </div>
    </div>
  )
}

function Step({
  state,
  title,
  sub,
  delay,
}: {
  state: 'done' | 'active' | 'pending'
  title: string
  sub: string
  delay: number
}) {
  const cls = {
    done: 'bg-success-subtle text-success ring-success/15',
    active: 'bg-eviction-subtle text-eviction ring-eviction/15',
    pending: 'bg-subtle text-muted ring-border',
  }[state]

  const Icon = state === 'done' ? ShieldCheck : state === 'active' ? FileText : AlertTriangle

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + delay, duration: 0.4 }}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
    >
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${cls}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-semibold text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted">{sub}</p>
      </div>
      {state === 'active' && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-eviction opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-eviction" />
        </span>
      )}
    </m.div>
  )
}
