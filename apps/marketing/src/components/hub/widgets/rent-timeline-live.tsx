'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Phone, MessageSquare, TrendingUp } from 'lucide-react'

interface Unit {
  id: string
  address: string
  tenant: string
  rent: number
}

const UNITS: Unit[] = [
  { id: 'U-01', address: '215 Oak St #1', tenant: 'Alex J.', rent: 1050 },
  { id: 'U-02', address: '215 Oak St #2', tenant: 'Jordan M.', rent: 950 },
  { id: 'U-03', address: '412 Elm Ave', tenant: 'Casey P.', rent: 1100 },
  { id: 'U-04', address: '88 Ridge Rd', tenant: 'Riley T.', rent: 1100 },
]

// The animation runs through these phases on a loop.
type Step = {
  day: string
  description: string
  state: { paid: string[]; late: string[]; coachActive: boolean; coachStep?: string }
}

const STEPS: Step[] = [
  {
    day: 'Mar 01',
    description: 'Auto-debit runs at 7:00 AM',
    state: { paid: [], late: [], coachActive: false },
  },
  {
    day: 'Mar 02',
    description: 'Three of four payments clear overnight',
    state: { paid: ['U-01', 'U-02', 'U-03'], late: [], coachActive: false },
  },
  {
    day: 'Mar 06',
    description: 'Riley\'s payment 5 days late — Coach activated',
    state: { paid: ['U-01', 'U-02', 'U-03'], late: ['U-04'], coachActive: true, coachStep: 'Reading tenant payment history…' },
  },
  {
    day: 'Mar 06',
    description: '14 months on-time. Coach suggests check-in, not escalation.',
    state: { paid: ['U-01', 'U-02', 'U-03'], late: ['U-04'], coachActive: true, coachStep: 'Drafting friendly check-in SMS' },
  },
  {
    day: 'Mar 07',
    description: 'Riley replies: card expired. Updates and pays in full.',
    state: { paid: ['U-01', 'U-02', 'U-03', 'U-04'], late: [], coachActive: false },
  },
]

export function RentTimelineLive() {
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]
  const collected = step.state.paid.reduce(
    (sum, id) => sum + (UNITS.find((u) => u.id === id)?.rent ?? 0),
    0,
  )
  const total = UNITS.reduce((s, u) => s + u.rent, 0)

  useEffect(() => {
    const t = setTimeout(() => setStepIdx((i) => (i + 1) % STEPS.length), 3000)
    return () => clearTimeout(t)
  }, [stepIdx])

  return (
    <section className="border-y border-ink-200/60 bg-ink-50/30 py-20 md:py-24">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-700">
              Live · March 2026 rent cycle
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Rent collects itself. The Coach handles the rest.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-500 md:mt-0">
            Auto-debit on the 1st. The Delinquency Coach watches tenant history
            before it escalates. Most late rent resolves with a single SMS.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          {/* Left: units list */}
          <div className="rounded-2xl border border-ink-200/70 bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
                  This month
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-ink-900">
                  ${collected.toLocaleString()} <span className="text-base text-ink-400">/ ${total.toLocaleString()}</span>
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                <TrendingUp className="h-3 w-3" />
                {Math.round((collected / total) * 100)}% collected
              </span>
            </div>

            <ul className="space-y-2">
              {UNITS.map((u) => {
                const isPaid = step.state.paid.includes(u.id)
                const isLate = step.state.late.includes(u.id)
                return (
                  <li
                    key={u.id}
                    className={`flex items-center gap-3 rounded-xl border bg-white p-3 transition-colors ${
                      isLate
                        ? 'border-rose-200 bg-rose-50/30'
                        : isPaid
                          ? 'border-emerald-200/70'
                          : 'border-ink-200'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        isPaid
                          ? 'bg-emerald-50 text-emerald-600'
                          : isLate
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-ink-100 text-ink-400'
                      }`}
                    >
                      {isPaid ? <CheckCircle2 className="h-4 w-4" /> : isLate ? <AlertCircle className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{u.address}</p>
                      <p className="truncate text-xs text-ink-500">
                        {u.tenant} · <span className="font-mono">${u.rent.toLocaleString()}</span>
                      </p>
                    </div>
                    <span
                      className={`font-mono text-[11px] font-semibold ${
                        isPaid ? 'text-emerald-700' : isLate ? 'text-rose-700' : 'text-ink-400'
                      }`}
                    >
                      {isPaid ? 'PAID' : isLate ? '5d LATE' : 'PENDING'}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  {step.day}
                </span>
                <span className="text-xs text-ink-700">{step.description}</span>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {STEPS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setStepIdx(i)}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i === stepIdx ? 'bg-ember-500' : i < stepIdx ? 'bg-ember-200' : 'bg-ink-200 hover:bg-ink-300'
                  }`}
                  aria-label={`Step ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Right: Coach panel */}
          <div className="rounded-2xl border border-ink-200/70 bg-white p-6">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-700">
              Delinquency Coach
            </p>

            <AnimatePresence mode="wait">
              {step.state.coachActive ? (
                <motion.div
                  key="coach-on"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 space-y-4"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember-400 opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-ember-500" />
                    </span>
                    Reviewing Riley T.
                  </div>

                  <div className="rounded-xl border border-ember-200 bg-ember-50/40 p-3 text-xs leading-relaxed text-ink-700">
                    <p className="font-semibold text-ember-800">{step.state.coachStep}</p>
                    <ul className="mt-2 space-y-1 text-ink-700">
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        14 months on-time payment history
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        Avg. delay: 0 days (on-time 95% of payments)
                      </li>
                      <li className="flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3 text-amber-600" />
                        First late payment in lease term
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                      Recommended action
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-800">
                      Send a friendly check-in SMS — not a formal notice.
                      Historical data shows 87% of first-time late payments
                      resolve within 48 hours of a low-pressure outreach.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <MessageSquare className="h-3 w-3" />
                        Send SMS
                      </button>
                      <button className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-800">
                        <Phone className="h-3 w-3" />
                        Call
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="coach-off"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/40 p-6 text-center"
                >
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  <p className="mt-3 text-sm font-semibold text-ink-900">All payments current</p>
                  <p className="mt-1 text-xs text-ink-500">Coach standing by</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
