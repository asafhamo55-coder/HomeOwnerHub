'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, FileText, Sparkles } from 'lucide-react'

export function HoaDashboardVisual() {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-1.5 border-b border-ink-200/70 pb-3">
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="ml-3 text-[10px] text-ink-400">Madison Park HOA · Daily Digest</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
          <CheckCircle2 className="h-2.5 w-2.5" />
          All clear
        </span>
      </div>

      <div className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Today's 3 priorities</p>

        <div className="mt-3 space-y-2">
          <Row
            delay={0}
            Icon={AlertCircle}
            iconClass="text-amber-600 bg-amber-50"
            title="ARC request: 415 Park Ln"
            sub="Deck addition — review packet ready"
            chip="Bar B · Review"
            chipClass="bg-amber-50 text-amber-700 ring-amber-100"
          />
          <Row
            delay={0.1}
            Icon={FileText}
            iconClass="text-emerald-700 bg-emerald-50"
            title="Violation notice drafted"
            sub="Unapproved fence color at 211 Oak"
            chip="Tap to approve"
            chipClass="bg-emerald-50 text-emerald-700 ring-emerald-100"
          />
          <Row
            delay={0.2}
            Icon={Sparkles}
            iconClass="text-brand-700 bg-brand-50"
            title="Reserve Live updated"
            sub="Projection: +$4,200 vs. last month"
            chip="View"
            chipClass="bg-brand-50 text-brand-700 ring-brand-100"
          />
        </div>

        <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            This week
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="Questions answered" value="38" />
            <Stat label="Notices sent" value="4" />
            <Stat label="Hours saved" value="9.5" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  Icon,
  iconClass,
  title,
  sub,
  chip,
  chipClass,
  delay,
}: {
  Icon: typeof CheckCircle2
  iconClass: string
  title: string
  sub: string
  chip: string
  chipClass: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + delay, duration: 0.4 }}
      className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-2.5"
    >
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-semibold text-ink-900">{title}</p>
        <p className="truncate text-[11px] text-ink-500">{sub}</p>
      </div>
      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${chipClass}`}>
        {chip}
      </span>
    </motion.div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tracking-tight text-ink-900">{value}</p>
      <p className="text-[10px] text-ink-500">{label}</p>
    </div>
  )
}
