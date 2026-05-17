'use client'

import { motion } from 'framer-motion'
import { Quote } from 'lucide-react'

const stats = [
  { label: 'Hours saved per month', value: '32+', sub: 'Treasurer + secretary combined' },
  { label: 'Covenant questions answered', value: '247', sub: 'In the first 30 days' },
  { label: 'Onboarding time', value: '17 min', sub: 'From upload to first cited answer' },
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
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Case study · Madison Park HOA · 180 doors
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] text-ink-900 md:text-[44px] md:leading-[1.05]">
              Madison Park found a <span className="text-emerald-700">$4,200 reserve error</span> in week three. The platform paid for itself.
            </h2>

            <div className="mt-7 rounded-2xl border border-ink-200/70 bg-white p-7 ring-card">
              <Quote className="h-6 w-6 text-ember-500" />
              <p className="mt-3 text-base leading-relaxed text-ink-700">
                We're 180 homes, all volunteer. I was the treasurer carrying
                eight to twelve unpaid hours a week. Ledger answers
                covenant questions in seconds with the exact section cited,
                drafts violation notices for the board to approve, and writes
                our meeting minutes the night of. The first month, we caught a
                reserve fund discrepancy nobody had noticed in three years.
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-ink-200/70 pt-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-ember-500 text-sm font-semibold text-white">
                  LJ
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">Linda Jackson</p>
                  <p className="text-xs text-ink-500">Treasurer, Madison Park HOA · Johns Creek, GA</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid gap-3"
          >
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex items-baseline justify-between rounded-2xl border border-ink-200/70 bg-gradient-to-br from-white to-ink-50/50 p-6 ring-card"
              >
                <div>
                  <p className="text-sm font-medium text-ink-700">{s.label}</p>
                  <p className="mt-1 text-xs text-ink-500">{s.sub}</p>
                </div>
                <p className="text-4xl font-semibold tracking-tight text-ink-900">
                  {s.value}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-ember-50/40 p-6 ring-card">
              <p className="text-sm font-semibold text-ink-900">
                Madison Park, in their words
              </p>
              <p className="mt-2 text-xs text-ink-600">
                "We caught a $4,200 reserve discrepancy our spreadsheet had been
                wrong about since 2023. Ledger paid for itself in week
                three."
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
