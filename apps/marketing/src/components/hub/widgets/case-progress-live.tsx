'use client'

import { useEffect, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { Scale, FileText, Mail, Gavel, ShieldCheck, Lock, AlertTriangle } from 'lucide-react'

type Stage = 'intake' | 'notice' | 'attorney' | 'service' | 'filing'

interface StageDef {
  id: Stage
  label: string
  Icon: typeof Scale
  bar: 'A' | 'B' | 'C'
  detail: string
  citation?: string
  duration: number
}

const STAGES: StageDef[] = [
  {
    id: 'intake',
    label: 'Tenant intake captured',
    Icon: FileText,
    bar: 'C',
    detail: '11 days overdue · $1,100 owed · lease since Jan 2024',
    duration: 2000,
  },
  {
    id: 'notice',
    label: '30-day notice drafted',
    Icon: FileText,
    bar: 'B',
    detail: 'County-specific template generated. Bar B: awaiting attorney review.',
    citation: 'GA OCGA Section 44-7-50',
    duration: 2500,
  },
  {
    id: 'attorney',
    label: 'GA counsel reviewing',
    Icon: ShieldCheck,
    bar: 'B',
    detail: 'Atlanta-licensed attorney reviewing template. SLA: 2 business days.',
    duration: 2500,
  },
  {
    id: 'service',
    label: 'Certified mail dispatched',
    Icon: Mail,
    bar: 'C',
    detail: 'USPS certified mail tracking attached to case record.',
    duration: 2500,
  },
  {
    id: 'filing',
    label: 'Court filing package (demo)',
    Icon: Gavel,
    bar: 'A',
    detail: 'Complaint in Replevin · Affidavit · Summons. Bar A: your attorney files.',
    duration: 3500,
  },
]

const barClass = {
  C: 'bg-success-subtle text-success ring-success/15',
  B: 'bg-warning-subtle text-warning ring-warning/15',
  A: 'bg-subtle text-foreground-secondary ring-border',
}

export function CaseProgressLive() {
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    const t = setTimeout(
      () => setActiveIdx((i) => (i + 1) % STAGES.length),
      STAGES[activeIdx].duration,
    )
    return () => clearTimeout(t)
  }, [activeIdx])

  const active = STAGES[activeIdx]

  return (
    <section className="border-y border-border/60 bg-subtle/30 py-20 md:py-24">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12">
          <div className="max-w-xl">
            <p className="eyebrow text-eviction">
              Live · case EV-2026-00145
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Every step. Cited. Audit-logged. Attorney-gated.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted md:mt-0">
            Eviction is a sequence. We render the right notice in the right
            county at the right time, route every legal-adjacent step through a
            Georgia attorney, and watermark anything pre-filing.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          {/* Left: stage list */}
          <ol className="rounded-2xl border border-border/70 bg-surface p-6">
            {STAGES.map((s, i) => {
              const isActive = i === activeIdx
              const isDone = i < activeIdx
              return (
                <li key={s.id} className="relative pb-5 last:pb-0">
                  {i < STAGES.length - 1 && (
                    <span
                      className={`absolute left-[15px] top-8 h-full w-px ${
                        isDone ? 'bg-eviction/25' : 'bg-border'
                      }`}
                    />
                  )}
                  <button
                    onClick={() => setActiveIdx(i)}
                    className="relative flex w-full items-start gap-3 text-left"
                  >
                    <span
                      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${
                        isActive
                          ? 'bg-eviction-subtle text-eviction ring-eviction/25'
                          : isDone
                            ? 'bg-eviction text-primary-fg ring-eviction/40'
                            : 'bg-surface text-muted ring-border'
                      }`}
                    >
                      <s.Icon className="h-3.5 w-3.5" />
                      {isActive && (
                        <span className="absolute inset-0 animate-ping rounded-full bg-eviction/25 opacity-50" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={`truncate text-sm font-semibold ${
                            isActive ? 'text-foreground' : isDone ? 'text-foreground-secondary' : 'text-muted'
                          }`}
                        >
                          {s.label}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1 ${barClass[s.bar]}`}
                        >
                          Bar {s.bar}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>

          {/* Right: stage detail */}
          <div className="rounded-2xl border border-border/70 bg-surface p-6 md:p-8">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Stage {activeIdx + 1} of {STAGES.length}
              </p>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1 ${barClass[active.bar]}`}
              >
                Bar {active.bar} · {active.bar === 'C' ? 'Production' : active.bar === 'B' ? 'Human-reviewed' : 'Demo only'}
              </span>
            </div>

            <AnimatePresence mode="wait">
              <m.div
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-6"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-eviction-subtle text-eviction">
                    <active.Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {active.label}
                  </h3>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-foreground-secondary">{active.detail}</p>

                {active.citation && (
                  <div className="mt-4 rounded-lg border border-eviction/25 bg-eviction-subtle/40 p-3">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-eviction">
                      Cited statute
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                      {active.citation}
                    </p>
                  </div>
                )}

                {active.bar === 'A' && (
                  <div className="relative mt-5 overflow-hidden rounded-lg border border-warning/25 bg-warning-subtle/40 p-3">
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
                      <span className="rotate-[-8deg] font-mono text-3xl font-black tracking-wider text-warning">
                        DEMO ONLY
                      </span>
                    </div>
                    <div className="relative flex items-center gap-2 text-xs text-warning">
                      <Lock className="h-3.5 w-3.5" />
                      <span className="font-semibold">Court filings are watermarked and never auto-dispatched.</span>
                    </div>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/70 pt-5">
                  <Meta label="Model" value="qwen-2.5-14b" />
                  <Meta label="Audit hash" value={`#${(activeIdx * 743 + 41207).toString(16).slice(0, 8)}`} />
                  <Meta label="Tenant ID" value="riley_t_88_ridge" />
                  <Meta label="Jurisdiction" value="Fulton County, GA" />
                </div>
              </m.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-eviction" />
            Every Bar B output routes to a Georgia attorney before send
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            Court filings stay Bar A in v1: your attorney files the real thing
          </span>
        </div>
      </div>
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-xs text-foreground">{value}</p>
    </div>
  )
}
