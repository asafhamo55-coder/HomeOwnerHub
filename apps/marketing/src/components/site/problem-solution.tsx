'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { OTHER_HUBS_ENABLED } from '@/lib/hubs'

const problems = [
  'Volunteer board treasurers spending unpaid evenings on paperwork',
  'Violation notices stalled because nobody wants to draft a legal letter',
  'Meeting minutes that take an evening to write, and still miss the decisions',
  'Month-end board reports pieced together by hand from three spreadsheets',
  'The same resident questions answered by email, one at a time',
  // BL-097: the landlord row belongs to PM Hub, which is not offered right now.
  ...(OTHER_HUBS_ENABLED ? ['Landlords on Venmo + spreadsheets, missing late rent until it\'s a month behind'] : []),
]

const solutions = [
  { line: 'Covenant Brain answers any rule question — with the section cited.' },
  { line: 'Violation Drafter writes the letter. The board approves it in one click from Approvals.' },
  { line: 'Paste the meeting transcript and AI drafts board-ready minutes for the board to approve.' },
  { line: 'On the 1st, the board gets a month-end report: cash, dues collected, overdue balances, budget and violations.' },
  { line: 'The inbox drafts each reply with the home’s details alongside, and residents can ask the portal assistant first.' },
  ...(OTHER_HUBS_ENABLED ? [{ line: 'PM Hub tracks rent, sends reminders, and flags risk before it hurts.' }] : []),
]

export function ProblemSolution() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-fg">
            The work that nobody volunteered for
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Volunteer boards spend their evenings on paperwork. That paperwork is what AI is for.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            {OTHER_HUBS_ENABLED
              ? 'HOA boards, landlords, and operators all do the same paperwork — at different stages of the same life cycle. We built one system that handles all of it.'
              : 'Rules, notices, minutes and money — the same paperwork every self-managed board does. We built one system that handles all of it.'}
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-border/70 bg-surface p-8 ring-card"
          >
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-danger-subtle text-danger">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Today
            </div>
            <ul className="space-y-4">
              {problems.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground-secondary">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
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
            className="rounded-2xl border border-primary/70 bg-gradient-to-br from-surface via-surface to-primary-subtle/60 p-8 ring-card"
          >
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-success-subtle text-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              With HomeownerHub
            </div>
            <ul className="space-y-4">
              {solutions.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
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
