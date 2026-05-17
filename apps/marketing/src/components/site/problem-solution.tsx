'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

const problems = [
  'Volunteer board treasurers burning 10+ unpaid hours every week on paperwork',
  'Violation notices stalled because nobody wants to draft a legal letter',
  'Meeting minutes that take 3 hours to write, and still miss the decisions',
  'Reserve studies that cost $5–8K and lag 8 weeks behind reality',
  'Landlords on Venmo + spreadsheets, missing late rent until it\'s a month behind',
]

const solutions = [
  { line: 'Covenant Brain answers any rule question in 4 seconds — with the section cited.' },
  { line: 'Violation Drafter writes the notice. Board approves in one tap. Sent in 2 minutes.' },
  { line: 'Minutes Engine listens to the meeting and ships board-ready minutes that night.' },
  { line: 'Reserve Live runs the projection in real time. Updates with every invoice.' },
  { line: 'PM Hub tracks rent, sends reminders, and flags risk before it hurts.' },
]

export function ProblemSolution() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-ember-600">
            The work that nobody volunteered for
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Volunteer boards burn 10 hours a week on paperwork. That paperwork is what AI is for.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            HOA boards, landlords, and operators all do the same paperwork — at
            different stages of the same life cycle. We built one system that
            handles all of it.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-ink-200/70 bg-white p-8 ring-card"
          >
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-ink-900">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Today
            </div>
            <ul className="space-y-4">
              {problems.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-700">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                  {p}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-brand-200/70 bg-gradient-to-br from-white via-white to-brand-50/60 p-8 ring-card"
          >
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-ink-900">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              With Ledger
            </div>
            <ul className="space-y-4">
              {solutions.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{s.line}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
