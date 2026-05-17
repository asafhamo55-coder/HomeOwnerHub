'use client'

import { motion } from 'framer-motion'
import { Scale, ShieldCheck, FileText, AlertTriangle } from 'lucide-react'

export function EvictionCaseVisual() {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-1.5 border-b border-ink-200/70 pb-3">
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="ml-3 text-[10px] text-ink-400">Case #EV-2026-00145</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 ring-1 ring-violet-100">
          <Scale className="h-2.5 w-2.5" />
          Attorney review
        </span>
      </div>

      <div className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Case progress</p>

        <div className="mt-3 space-y-2">
          <Step delay={0} state="done" title="Tenant intake captured" sub="Riley T., 88 Ridge Rd · 11 days overdue" />
          <Step delay={0.1} state="done" title="30-day notice drafted" sub="GA OCGA §34-6-2 compliant" />
          <Step delay={0.2} state="active" title="Attorney review in progress" sub="Reviewed by GA counsel · 2 business days" />
          <Step delay={0.3} state="pending" title="Certified mail to tenant" sub="Auto-dispatch on approval" />
          <Step delay={0.4} state="pending" title="Court filing (demo only)" sub="Your attorney files the real document" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="relative mt-4 overflow-hidden rounded-xl border border-violet-200 bg-violet-50/40 p-3"
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-12deg] text-[36px] font-black tracking-wider text-violet-200/60">
              DEMO ONLY
            </span>
          </div>
          <div className="relative">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-700" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
                Bar A · Demo only
              </p>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-ink-800">
              Court filing packet is generated for education. Your Georgia attorney files the real document — no exceptions.
            </p>
          </div>
        </motion.div>
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
    done: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    active: 'bg-violet-50 text-violet-700 ring-violet-100',
    pending: 'bg-ink-50 text-ink-400 ring-ink-200',
  }[state]

  const Icon = state === 'done' ? ShieldCheck : state === 'active' ? FileText : AlertTriangle

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + delay, duration: 0.4 }}
      className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-2.5"
    >
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${cls}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-semibold text-ink-900">{title}</p>
        <p className="truncate text-[11px] text-ink-500">{sub}</p>
      </div>
      {state === 'active' && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
        </span>
      )}
    </motion.div>
  )
}
