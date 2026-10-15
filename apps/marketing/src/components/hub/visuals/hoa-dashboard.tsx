'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, FileText, Sparkles } from 'lucide-react'

export function HoaDashboardVisual() {
  return (
    <div className="bg-surface p-5">
      <div className="flex items-center gap-1.5 border-b border-border/70 pb-3">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-3 text-[10px] text-muted">Madison Park HOA · Daily Digest</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-success-subtle px-1.5 py-0.5 text-[9px] font-semibold text-success ring-1 ring-success/15">
          <CheckCircle2 className="h-2.5 w-2.5" />
          All clear
        </span>
      </div>

      <div className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Today's 3 priorities</p>

        <div className="mt-3 space-y-2">
          <Row
            delay={0}
            Icon={AlertCircle}
            iconClass="text-warning bg-warning-subtle"
            title="ARC request: 415 Park Ln"
            sub="Deck addition — review packet ready"
            chip="Bar B · Review"
            chipClass="bg-warning-subtle text-warning ring-warning/15"
          />
          <Row
            delay={0.1}
            Icon={FileText}
            iconClass="text-success bg-success-subtle"
            title="Violation notice drafted"
            sub="Unapproved fence color at 211 Oak"
            chip="Tap to approve"
            chipClass="bg-success-subtle text-success ring-success/15"
          />
          <Row
            delay={0.2}
            Icon={Sparkles}
            iconClass="text-primary bg-primary-subtle"
            title="Reserve Live updated"
            sub="Projection: +$4,200 vs. last month"
            chip="View"
            chipClass="bg-primary-subtle text-primary ring-primary/15"
          />
        </div>

        <div className="mt-5 rounded-xl border border-border bg-subtle/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
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
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
    >
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-semibold text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted">{sub}</p>
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
      <p className="text-lg font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  )
}
