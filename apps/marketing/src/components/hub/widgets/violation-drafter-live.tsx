'use client'

import { useEffect, useRef, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { Camera, FileText, ShieldCheck, Sparkles, Check } from 'lucide-react'

interface Scenario {
  trigger: string
  location: string
  citation: string
  draftLines: string[]
  /** Days the owner has to cure; the due date is worked out from today. */
  cureDays: number
}

const SCENARIOS: Scenario[] = [
  {
    trigger: 'Unapproved fence height',
    location: '211 Oak St',
    citation: 'CC&R Section 3.4 — Architectural Standards',
    draftLines: [
      'Your fence at 211 Oak St exceeds the 6-foot height limit specified in Section 3.4 of your CC&R.',
      'The Architectural Review Committee requires fence modifications to be submitted at least 14 days in advance.',
      'Required action: Submit modification plans to the ARC within 14 days, or return the fence to the approved 6-foot height.',
    ],
    cureDays: 14,
  },
  {
    trigger: 'Trash bins left curbside',
    location: '88 Ridge Rd',
    citation: 'Bylaws Section 4.1 — Common Area Standards',
    draftLines: [
      'Trash and recycling containers must be returned to the side or rear of the property within 24 hours of pickup, per Bylaws Section 4.1.',
      'Repeated occurrences over the past 30 days have been documented and photographed.',
      'Required action: Return containers within 24 hours of collection going forward. Continued violations may incur a $50 weekly fine per the published rule schedule.',
    ],
    cureDays: 7,
  },
  {
    trigger: 'Landscaping below standard',
    location: '412 Elm Ave',
    citation: 'CC&R Section 5.2 — Property Maintenance',
    draftLines: [
      'The front lawn at 412 Elm Ave does not meet the maintenance standard described in CC&R Section 5.2 ("kept in a neat and orderly manner").',
      'Specific issues observed: grass exceeding 8 inches, visible weed growth in landscaping beds.',
      'Required action: Restore landscaping to compliant condition within 14 days. The ARC may approve alternative xeriscape designs if submitted in writing.',
    ],
    cureDays: 14,
  },
]

const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }

/** "March 15, 2026" for a day offset from today, so the sample never goes stale. */
function dateAfter(today: Date, days: number, short = false): string {
  const d = new Date(today)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-US', short ? { ...DATE_FORMAT, month: 'short' } : DATE_FORMAT)
}

type Phase = 'capturing' | 'analyzing' | 'drafting' | 'ready'

export function ViolationDrafterLive() {
  const [idx, setIdx] = useState(0)
  const [today] = useState(() => new Date())
  const [phase, setPhase] = useState<Phase>('capturing')
  const [visibleLines, setVisibleLines] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const scenario = SCENARIOS[idx]
    if (phase === 'capturing') {
      timer.current = setTimeout(() => setPhase('analyzing'), 1400)
    } else if (phase === 'analyzing') {
      timer.current = setTimeout(() => {
        setPhase('drafting')
        setVisibleLines(0)
      }, 1300)
    } else if (phase === 'drafting') {
      if (visibleLines < scenario.draftLines.length) {
        timer.current = setTimeout(() => setVisibleLines((v) => v + 1), 700)
      } else {
        timer.current = setTimeout(() => setPhase('ready'), 600)
      }
    } else if (phase === 'ready') {
      timer.current = setTimeout(() => {
        setIdx((i) => (i + 1) % SCENARIOS.length)
        setPhase('capturing')
        setVisibleLines(0)
      }, 4500)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [idx, phase, visibleLines])

  const scenario = SCENARIOS[idx]

  return (
    <section className="section border-y border-border bg-surface" id="violation-drafter-demo">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12">
          <div className="max-w-xl">
            <p className="eyebrow text-success">
              Live · Violation Drafter
            </p>
            <h2 className="t-h2 mt-4 text-foreground">
              Photo in. Letter drafted. Board approves in one click.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted md:mt-0">
            The Violation Drafter reads your CC&amp;R, matches the rule, and
            drafts a letter that cites it. Bar B — board reviews before
            it goes out.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          {/* Left: trigger card */}
          <div className="rounded-2xl border border-border/70 bg-surface p-6">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Step 1 · Capture
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-subtle text-success">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{scenario.trigger}</p>
                <p className="font-mono text-xs text-muted">{scenario.location}</p>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-xs">
              <Step
                label="Photo uploaded"
                done
              />
              <Step
                label="Matching covenant rules"
                done={phase !== 'capturing'}
                pulsing={phase === 'analyzing'}
              />
              <Step
                label="Drafting notice"
                done={phase === 'ready'}
                pulsing={phase === 'drafting'}
              />
              <Step
                label="Ready for board review"
                done={phase === 'ready'}
              />
            </div>

            <div className="mt-6 rounded-lg border border-border bg-subtle/50 p-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                Cited section
              </p>
              <p className="mt-1 text-xs font-medium text-foreground">{scenario.citation}</p>
            </div>

            <div className="mt-3 flex gap-2">
              {SCENARIOS.map((s, i) => (
                <button
                  key={s.trigger}
                  onClick={() => {
                    setIdx(i)
                    setPhase('capturing')
                    setVisibleLines(0)
                  }}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i === idx ? 'bg-success-solid' : 'bg-border hover:bg-border-strong'
                  }`}
                  aria-label={`Show scenario: ${s.trigger}`}
                />
              ))}
            </div>
          </div>

          {/* Right: notice draft */}
          <div className="rounded-2xl border border-border/70 bg-surface p-6 md:p-8">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Step 2 · AI-drafted notice
              </p>
              <span className="inline-flex items-center gap-1 rounded-md bg-warning-subtle px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-warning ring-1 ring-warning/15">
                Bar B · Awaiting board review
              </span>
            </div>

            <div className="mt-6 min-h-[280px] rounded-xl border border-border/70 bg-subtle/30 p-5 md:p-6">
              <div className="border-b border-border/70 pb-3 font-serif text-sm text-foreground-secondary">
                <p suppressHydrationWarning>{dateAfter(today, 0)}</p>
                <p className="mt-1 text-xs">
                  To the property owner at <span className="font-medium text-foreground">{scenario.location}</span>
                </p>
              </div>
              <p className="mt-4 font-serif text-base font-semibold tracking-tight text-foreground">
                Notice of Covenant Violation
              </p>

              <div className="mt-3 space-y-3 font-serif text-sm leading-relaxed text-foreground">
                <AnimatePresence>
                  {scenario.draftLines.slice(0, visibleLines).map((line, i) => (
                    <m.p
                      key={`${idx}-${i}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      {line}
                    </m.p>
                  ))}
                </AnimatePresence>
                {phase === 'drafting' && (
                  <span className="inline-block h-4 w-[2px] -translate-y-[1px] animate-blink bg-foreground align-middle" />
                )}
              </div>

              {phase === 'ready' && (
                <m.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 border-t border-border/70 pt-4 font-mono text-[11px] text-foreground-secondary"
                >
                  <span className="text-muted">Deadline: </span>
                  <span className="font-semibold text-foreground" suppressHydrationWarning>{`${scenario.cureDays} days, by ${dateAfter(today, scenario.cureDays, true)}`}</span>
                </m.div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Sparkles className="h-3.5 w-3.5 text-success" />
                <span>
                  Cited to{' '}
                  <span className="font-mono font-semibold text-foreground">{scenario.citation}</span>
                </span>
              </div>
              <button
                disabled={phase !== 'ready'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                Approve &amp; send
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Audit log captured · model + prompt hash recorded
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-success" />
            Approving files the violation · sending to the homeowner is a separate step
          </span>
        </div>
      </div>
    </section>
  )
}

function Step({
  label,
  done,
  pulsing,
}: {
  label: string
  done?: boolean
  pulsing?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-3 w-3 items-center justify-center rounded-full ring-1 ${
          done
            ? 'bg-success-solid ring-success/25'
            : pulsing
              ? 'bg-success-subtle ring-success/25'
              : 'bg-subtle ring-border'
        }`}
      >
        {done && <Check className="h-2 w-2 text-background" strokeWidth={4} />}
        {pulsing && (
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-success-solid opacity-70" />
        )}
      </span>
      <span className={done || pulsing ? 'text-foreground' : 'text-muted'}>{label}</span>
    </div>
  )
}
