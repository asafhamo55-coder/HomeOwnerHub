'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, FileText, ShieldCheck, Sparkles, Check } from 'lucide-react'

interface Scenario {
  trigger: string
  location: string
  citation: string
  draftLines: string[]
  deadline: string
}

const SCENARIOS: Scenario[] = [
  {
    trigger: 'Unapproved fence height',
    location: '211 Oak St',
    citation: 'CC&R Section 3.4 — Architectural Standards',
    draftLines: [
      'Your fence at 211 Oak St exceeds the 6-foot height limit specified in Section 3.4 of the Madison Park CC&R.',
      'The Architectural Review Committee requires fence modifications to be submitted at least 14 days in advance.',
      'Required action: Submit modification plans to the ARC within 14 days, or return the fence to the approved 6-foot height.',
    ],
    deadline: '14 days — by Mar 29, 2026',
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
    deadline: '7 days — by Mar 22, 2026',
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
    deadline: '14 days — by Mar 29, 2026',
  },
]

type Phase = 'capturing' | 'analyzing' | 'drafting' | 'ready'

export function ViolationDrafterLive() {
  const [idx, setIdx] = useState(0)
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
    <section className="border-y border-ink-200/60 bg-ink-50/30 py-20 md:py-24" id="violation-drafter-demo">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Live · Violation Drafter
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Photo in. Notice out. Board approves in a tap.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-500 md:mt-0">
            The Violation Drafter reads your CC&amp;R, matches the rule, and
            renders a legally formatted notice. Bar B — board reviews before
            it goes out.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          {/* Left: trigger card */}
          <div className="rounded-2xl border border-ink-200/70 bg-white p-6">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              Step 1 · Capture
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">{scenario.trigger}</p>
                <p className="font-mono text-xs text-ink-500">{scenario.location}</p>
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

            <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50/50 p-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                Cited section
              </p>
              <p className="mt-1 text-xs font-medium text-ink-800">{scenario.citation}</p>
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
                    i === idx ? 'bg-emerald-500' : 'bg-ink-200 hover:bg-ink-300'
                  }`}
                  aria-label={`Show scenario: ${s.trigger}`}
                />
              ))}
            </div>
          </div>

          {/* Right: notice draft */}
          <div className="rounded-2xl border border-ink-200/70 bg-white p-6 md:p-8">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
                Step 2 · AI-drafted notice
              </p>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-amber-100">
                Bar B · Awaiting board review
              </span>
            </div>

            <div className="mt-6 min-h-[280px] rounded-xl border border-ink-200/70 bg-ink-50/30 p-5 md:p-6">
              <div className="border-b border-ink-200/70 pb-3 font-serif text-sm text-ink-700">
                <p>March 15, 2026</p>
                <p className="mt-1 text-xs">
                  To the property owner at <span className="font-medium text-ink-900">{scenario.location}</span>
                </p>
              </div>
              <p className="mt-4 font-serif text-base font-semibold tracking-tight text-ink-900">
                Notice of Covenant Violation
              </p>

              <div className="mt-3 space-y-3 font-serif text-sm leading-relaxed text-ink-800">
                <AnimatePresence>
                  {scenario.draftLines.slice(0, visibleLines).map((line, i) => (
                    <motion.p
                      key={`${idx}-${i}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      {line}
                    </motion.p>
                  ))}
                </AnimatePresence>
                {phase === 'drafting' && (
                  <span className="inline-block h-4 w-[2px] -translate-y-[1px] animate-blink bg-ink-900 align-middle" />
                )}
              </div>

              {phase === 'ready' && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 border-t border-ink-200/70 pt-4 font-mono text-[11px] text-ink-600"
                >
                  <span className="text-ink-500">Deadline: </span>
                  <span className="font-semibold text-ink-900">{scenario.deadline}</span>
                </motion.div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Cited to{' '}
                  <span className="font-mono font-semibold text-ink-800">{scenario.citation}</span>
                </span>
              </div>
              <button
                disabled={phase !== 'ready'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                Approve &amp; send
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Audit log captured · model + prompt hash recorded
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-emerald-600" />
            Notice persists to PDF · certified mail dispatch optional
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
            ? 'bg-emerald-500 ring-emerald-200'
            : pulsing
              ? 'bg-emerald-100 ring-emerald-200'
              : 'bg-ink-100 ring-ink-200'
        }`}
      >
        {done && <Check className="h-2 w-2 text-white" strokeWidth={4} />}
        {pulsing && (
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-70" />
        )}
      </span>
      <span className={done || pulsing ? 'text-ink-800' : 'text-ink-500'}>{label}</span>
    </div>
  )
}
