'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, AlertCircle, BookOpen, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'

type Bar = 'C' | 'B' | 'A'

const barStyle: Record<Bar, { label: string; color: string; Icon: typeof ShieldCheck }> = {
  C: {
    label: 'Bar C · Production',
    color: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Icon: ShieldCheck,
  },
  B: {
    label: 'Bar B · Human-reviewed',
    color: 'bg-amber-50 text-amber-700 ring-amber-100',
    Icon: AlertCircle,
  },
  A: {
    label: 'Bar A · Demo only',
    color: 'bg-slate-50 text-slate-700 ring-slate-200',
    Icon: BookOpen,
  },
}

const workflows: { name: string; bar: Bar; hub: 'HOA' | 'PM' | 'Eviction' | 'All'; description: string }[] = [
  { name: 'Onboarding Agent', bar: 'C', hub: 'All', description: 'Drops your entire doc set in. Tells you what HOA you have in 15 minutes.' },
  { name: 'Covenant Brain', bar: 'C', hub: 'HOA', description: 'Ask any rule question. Get a cited answer in 4 seconds.' },
  { name: 'Violation Drafter', bar: 'B', hub: 'HOA', description: 'Photo + caption → legally formatted notice. Board taps approve.' },
  { name: 'ARC Recommender', bar: 'B', hub: 'HOA', description: 'Architectural review packets prepared and citation-backed.' },
  { name: 'Multilingual Comms', bar: 'C', hub: 'All', description: 'Every outbound email auto-translated to each resident\'s language.' },
  { name: 'Conversational Resident Portal', bar: 'C', hub: 'HOA', description: 'Residents ask the AI before they email the board.' },
  { name: 'Minutes Engine', bar: 'B', hub: 'HOA', description: 'Records the meeting. Drafts the minutes. Captures every decision.' },
  { name: 'Lease & Document Q&A', bar: 'C', hub: 'PM', description: '"What does §4.2 say about pet deposits?" — answered in 3 seconds.' },
  { name: 'Vendor Oracle', bar: 'B', hub: 'HOA', description: 'Past spend, ratings, and recommended vendor for the next job.' },
  { name: 'Delinquency Coach', bar: 'B', hub: 'PM', description: 'Day 5 to day 30: notices, follow-ups, payment plan offers.' },
  { name: 'Tenant Risk Score', bar: 'A', hub: 'PM', description: 'Score a prospective tenant. Demo only — not for decisions yet.' },
  { name: 'Reserve Live', bar: 'B', hub: 'HOA', description: 'Reserve fund projection that updates with every transaction.' },
  { name: 'Budget Anomaly Detection', bar: 'B', hub: 'HOA', description: 'Flags spend >10% over budget YTD. Before the board meeting.' },
  { name: 'Support Agent', bar: 'C', hub: 'All', description: 'Tier-1 internal support. Knows every workflow and every doc.' },
  { name: 'Predictive Maintenance', bar: 'B', hub: 'PM', description: 'Forecasts component failure 30–60 days out.' },
  { name: 'Board Copilot', bar: 'B', hub: 'HOA', description: 'Pre-meeting brief: what happened, what\'s pending, what\'s next.' },
  { name: 'Court-filing Templates', bar: 'A', hub: 'Eviction', description: 'County-correct templates, watermarked DEMO until your lawyer signs.' },
]

export function WorkflowsGrid() {
  return (
    <section className="py-24 md:py-32" id="workflows">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            17 workflows · labeled by quality bar
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            We tell you what's production, what's beta, and what's demo.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            Every workflow ships with a quality bar visible in product and in
            marketing. No hidden hallucination risk. No "AI did it" deflection.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <Legend bar="C" />
            <Legend bar="B" />
            <Legend bar="A" />
          </div>
        </div>

        <div className="mt-16 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((w, i) => {
            const Icon = barStyle[w.bar].Icon
            return (
              <motion.div
                key={w.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: (i % 6) * 0.04 }}
                className="group rounded-2xl border border-ink-200/70 bg-white p-5 transition-all hover:border-ink-300 ring-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-[15px] font-semibold tracking-tight text-ink-900">
                      {w.name}
                    </h3>
                    <p className="mt-1.5 text-xs uppercase tracking-wider text-ink-400">
                      {w.hub}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                      barStyle[w.bar].color,
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {w.bar}
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-600">
                  {w.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Legend({ bar }: { bar: Bar }) {
  const s = barStyle[bar]
  const Icon = s.Icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1', s.color)}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  )
}
