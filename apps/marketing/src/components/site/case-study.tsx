'use client'

import { motion } from 'framer-motion'

// Truth rule (BL-042, BL-090): the earlier version showed "32+ hours saved",
// "247 questions", "17 min" and a "$4,200 reserve error" with nothing in the
// repo behind them, and the app has no reserve module. The customer quote
// went too (2026-10-19 owner-delegated defaults: no customer quote is
// verified). What's left: facts about the product, not customer results.
const facts = [
  { label: 'Every document answer', value: 'Cited', sub: 'Covenant Brain names the section, or says your documents don’t cover it' },
  { label: 'Every AI draft', value: 'Approvals', sub: 'Letters, bills and minutes wait for the board' },
  { label: 'Roster import', value: 'Self-serve', sub: 'CSV or Excel, CINC exports included' },
]

export function CaseStudy() {
  return (
    <section className="py-24 md:py-32" id="case-study">
      <div className="container-page">
        <div className="grid gap-12 md:grid-cols-[1.1fr,1fr] md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Built with Madison Park HOA · 180 doors
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] text-foreground md:text-[44px] md:leading-[1.05]">
              Built with a real volunteer board, <span className="text-success">not a demo deck.</span>
            </h2>

            <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
              Every workflow is shaped by what a self-managed board actually does
              after work: answer a rule question, send a violation letter, approve
              the minutes, close the month. The AI drafts; the board decides.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid gap-3"
          >
            {facts.map((s) => (
              <div
                key={s.label}
                className="flex items-baseline justify-between gap-4 rounded-2xl border border-border/70 bg-gradient-to-br from-surface to-subtle/50 p-6 ring-card"
              >
                <div>
                  <p className="text-sm font-medium text-foreground-secondary">{s.label}</p>
                  <p className="mt-1 text-xs text-muted">{s.sub}</p>
                </div>
                <p className="shrink-0 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {s.value}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary-subtle via-surface to-accent-subtle/40 p-6 ring-card">
              <p className="text-sm font-semibold text-foreground">
                Measured results, when they’re measured
              </p>
              <p className="mt-2 text-xs text-foreground-secondary">
                We’ll publish Madison Park’s numbers once the board has measured
                them and signed off. Until then we don’t print any.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
