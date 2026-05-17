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
    model: 'qwen-2.5-14b',
    hash: '0x1a4f7b',
    tenant: 'madison_park',
    status: 'completed',
  },
  {
    actor: 'violation-drafter',
    action: 'Generated notice for 211 Oak St · trash bins',
    workflow: 'violation_drafter',
    bar: 'B',
    model: 'qwen-2.5-14b',
    hash: '0xc8e2a1',
    tenant: 'madison_park',
    status: 'human-gated',
  },
  {
    actor: 'minutes-engine',
    action: 'Transcribed board meeting · captured 4 decisions',
    workflow: 'minutes_engine',
    bar: 'B',
    model: 'whisper-large-v3',
    hash: '0x9f3d5e',
    tenant: 'madison_park',
    status: 'human-gated',
  },
  {
    actor: 'multilingual-comms',
    action: 'Translated outbound email · EN → ES',
    workflow: 'multilingual_comms',
    bar: 'C',
    model: 'qwen-2.5-7b',
    hash: '0x4b7e22',
    tenant: 'madison_park',
    status: 'sent',
  },
  {
    actor: 'reserve-live',
    action: 'Refreshed reserve projection · flagged $4,200 variance',
    workflow: 'reserve_live',
    bar: 'B',
    model: 'qwen-2.5-14b',
    hash: '0x612f88',
    tenant: 'madison_park',
    status: 'completed',
  },
  {
    actor: 'covenant-brain',
    action: 'Answered query: "Are satellite dishes allowed?"',
    workflow: 'covenant_brain',
    bar: 'C',
    model: 'qwen-2.5-14b',
    hash: '0xae9c01',
    tenant: 'cumming_hoa',
    status: 'completed',
  },
  {
    actor: 'arc-recommender',
    action: 'Generated ARC packet · deck addition · 415 Park Ln',
    workflow: 'arc_recommender',
    bar: 'B',
    model: 'qwen-2.5-14b',
    hash: '0x77b340',
    tenant: 'madison_park',
    status: 'human-gated',
  },
  {
    actor: 'onboarding-agent',
    action: 'Ingested 47 docs · extracted 247 covenant rules',
    workflow: 'onboarding_agent',
    bar: 'C',
    model: 'qwen-2.5-14b',
    hash: '0x12a7f4',
    tenant: 'highland_park_hoa',
    status: 'completed',
  },
]

const barColor: Record<'C' | 'B' | 'A', string> = {
  C: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  B: 'bg-amber-50 text-amber-700 ring-amber-100',
  A: 'bg-slate-50 text-slate-700 ring-slate-200',
}

const statusColor: Record<AuditEntry['status'], string> = {
  completed: 'text-emerald-700',
  'human-gated': 'text-amber-700',
  sent: 'text-brand-700',
}

const actorIcon: Record<string, typeof ShieldCheck> = {
  'covenant-brain': BookOpen,
  'violation-drafter': FileText,
  'minutes-engine': FileText,
  'multilingual-comms': Sparkles,
  'reserve-live': Database,
  'arc-recommender': FileText,
  'onboarding-agent': Database,
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
    <section className="border-y border-ink-200/60 bg-ink-50/30 py-20 md:py-24">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Live · AIEventLog
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Every AI action. Logged. Cited. Defensible.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-500 md:mt-0">
            The AIEventLog is append-only. Every output records the model, the
            prompt hash, the tenant, the citation, and the human action taken.
            This is the legal-defense story.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-ink-950 text-ink-100">
          {/* Header chrome */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="font-mono text-xs text-white/80">
                <span className="text-white/40">stream</span> ledger.aieventlog
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-white/50">
              <span className="hidden sm:inline">{entries.length} entries · last 60s</span>
              <button
                onClick={() => setPaused((p) => !p)}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-white/70 transition-colors hover:bg-white/10"
              >
                {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {paused ? 'play' : 'pause'}
              </button>
            </div>
          </div>

          {/* Stream */}
          <ul className="divide-y divide-white/5">
            <AnimatePresence initial={false}>
              {entries.map((e) => {
                const Icon = actorIcon[e.actor] ?? ShieldCheck
                return (
                  <motion.li
                    key={e.id}
                    layout
                    initial={{ opacity: 0, x: -8, backgroundColor: 'rgba(16,185,129,0.08)' }}
                    animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(16,185,129,0)' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3"
                  >
                    <div className="hidden flex-col items-end gap-0.5 font-mono text-[10px] text-white/40 sm:flex">
                      <span>{e.ts}</span>
                      <span className="text-white/30">{e.hash}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-emerald-400/70" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-white/90">
                          <span className="text-emerald-300">{e.actor}</span>
                          <span className="text-white/40"> · </span>
                          <span className="text-white/70">{e.action}</span>
                        </p>
                        <p className="mt-1 truncate font-mono text-[10px] text-white/40">
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

          <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.03] px-5 py-3 font-mono text-[10px] text-white/40">
            <span>append-only · immutable · queryable by tenant_id, workflow, model</span>
            <span className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              demo stream — production logs include user_id, ip, latency
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
