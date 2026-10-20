'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, FileText, BookOpen, AlertCircle, Sparkles, Database, Pause, Play } from 'lucide-react'

interface AuditEntry {
  id: string
  ts: string
  actor: string
  action: string
  workflow: string
  bar: 'C' | 'B' | 'A'
  model: string
  hash: string
  tenant: string
  status: 'completed' | 'human-gated' | 'sent'
}

const ACTIONS: Omit<AuditEntry, 'id' | 'ts'>[] = [
  {
    actor: 'covenant-brain',
    action: 'Answered query: "Can residents paint their fence?"',
    workflow: 'covenant_brain',
    bar: 'C',
    model: 'gpt-oss-120b',
    hash: '0x1a4f7b',
    tenant: 'madison_park',
    status: 'completed',
  },
  {
    actor: 'violation-drafter',
    action: 'Generated notice for 211 Oak St · trash bins',
    workflow: 'violation_drafter',
    bar: 'B',
    model: 'gpt-oss-120b',
    hash: '0xc8e2a1',
    tenant: 'madison_park',
    status: 'human-gated',
  },
  {
    actor: 'meeting-minutes',
    action: 'Drafted minutes from transcript · captured 4 decisions',
    workflow: 'meeting_summary',
    bar: 'B',
    model: 'gpt-oss-120b',
    hash: '0x9f3d5e',
    tenant: 'madison_park',
    status: 'human-gated',
  },
  {
    actor: 'reply-drafter',
    action: 'Drafted inbox reply · contact details removed first',
    workflow: 'reply_drafter',
    bar: 'B',
    model: 'gpt-oss-120b',
    hash: '0x4b7e22',
    tenant: 'madison_park',
    status: 'human-gated',
  },
  {
    actor: 'bill-scan',
    action: 'Read vendor bill · Green Lawn Co. · sent to Approvals',
    workflow: 'bill_scan',
    bar: 'B',
    model: 'gpt-oss-120b',
    hash: '0x612f88',
    tenant: 'madison_park',
    status: 'completed',
  },
  {
    actor: 'covenant-brain',
    action: 'Answered query: "Are satellite dishes allowed?"',
    workflow: 'covenant_brain',
    bar: 'C',
    model: 'gpt-oss-120b',
    hash: '0xae9c01',
    tenant: 'cumming_hoa',
    status: 'completed',
  },
  {
    actor: 'board-copilot',
    action: 'Answered: "Who is more than 90 days overdue?"',
    workflow: 'board_copilot',
    bar: 'B',
    model: 'gpt-oss-120b',
    hash: '0x77b340',
    tenant: 'madison_park',
    status: 'completed',
  },
  {
    actor: 'document-onboarding',
    action: 'Indexed 47 governing documents by section',
    workflow: 'document_onboarding',
    bar: 'C',
    model: 'gpt-oss-120b',
    hash: '0x12a7f4',
    tenant: 'highland_park_hoa',
    status: 'completed',
  },
]

const barColor: Record<'C' | 'B' | 'A', string> = {
  C: 'bg-success-subtle text-success ring-success/15',
  B: 'bg-warning-subtle text-warning ring-warning/15',
  A: 'bg-subtle text-foreground-secondary ring-border',
}

const statusColor: Record<AuditEntry['status'], string> = {
  completed: 'text-success',
  'human-gated': 'text-warning',
  sent: 'text-primary',
}

const actorIcon: Record<string, typeof ShieldCheck> = {
  'covenant-brain': BookOpen,
  'violation-drafter': FileText,
  'meeting-minutes': FileText,
  'reply-drafter': Sparkles,
  'bill-scan': Database,
  'board-copilot': FileText,
  'document-onboarding': Database,
}

function newEntry(seed: number): AuditEntry {
  const action = ACTIONS[seed % ACTIONS.length]
  const now = new Date()
  const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
  return {
    ...action,
    id: `e${seed}-${now.getTime()}`,
    ts,
  }
}

export function AuditLogLive() {
  const [entries, setEntries] = useState<AuditEntry[]>(() =>
    Array.from({ length: 6 }, (_, i) => newEntry(i)),
  )
  const [seed, setSeed] = useState(6)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => {
      setEntries((prev) => [newEntry(seed), ...prev].slice(0, 8))
      setSeed((s) => s + 1)
    }, 2200)
    return () => clearInterval(t)
  }, [seed, paused])

  return (
    <section className="border-y border-border/60 bg-subtle/30 py-20 md:py-24">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Illustration · AI run log
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              AI runs. Logged. Cited.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted md:mt-0">
            Each AI workflow run is recorded with its workflow and prompt
            version, the model, an input hash, the output and its citations.
            Drafts still wait for the board.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-foreground text-background/90">
          {/* Header chrome */}
          <div className="flex items-center justify-between border-b border-background/10 bg-surface/[0.03] px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-solid opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success-solid" />
              </span>
              <span className="font-mono text-xs text-background/80">
                <span className="text-background/40">stream</span> homeownerhub.eventlog
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-background/50">
              <span className="hidden sm:inline">{entries.length} entries · last 60s</span>
              <button
                onClick={() => setPaused((p) => !p)}
                className="inline-flex items-center gap-1 rounded-md border border-background/10 px-2 py-0.5 text-background/70 transition-colors hover:bg-surface/10"
              >
                {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {paused ? 'play' : 'pause'}
              </button>
            </div>
          </div>

          {/* Stream */}
          <ul className="divide-y divide-background/5">
            <AnimatePresence initial={false}>
              {entries.map((e) => {
                const Icon = actorIcon[e.actor] ?? ShieldCheck
                return (
                  <motion.li
                    key={e.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3"
                  >
                    <div className="hidden flex-col items-end gap-0.5 font-mono text-[10px] text-background/40 sm:flex">
                      <span>{e.ts}</span>
                      <span className="text-background/30">{e.hash}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-success/70" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-background/90">
                          <span className="text-success">{e.actor}</span>
                          <span className="text-background/40"> · </span>
                          <span className="text-background/70">{e.action}</span>
                        </p>
                        <p className="mt-1 truncate font-mono text-[10px] text-background/40">
                          tenant={e.tenant} model={e.model}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`hidden font-mono text-[10px] font-semibold uppercase tracking-wider sm:inline ${statusColor[e.status]}`}
                      >
                        {e.status}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1 ${barColor[e.bar]}`}
                      >
                        Bar {e.bar}
                      </span>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>

          <div className="flex items-center justify-between border-t border-background/10 bg-surface/[0.03] px-5 py-3 font-mono text-[10px] text-background/40">
            <span>per association · readable by its board and admins</span>
            <span className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              sample entries, not real activity
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
