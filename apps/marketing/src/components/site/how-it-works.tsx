'use client'

import { motion } from 'framer-motion'
import { Upload, ScanSearch, MessageCircleQuestion, Users } from 'lucide-react'

const steps = [
  {
    n: '01',
    Icon: Upload,
    title: 'Drop your documents',
    body:
      'Upload your CC&R, bylaws, budget, and recent minutes. PDFs, scans, even 1987 photocopies. We handle the messy stuff.',
  },
  {
    n: '02',
    Icon: ScanSearch,
    title: 'AI reads everything',
    body:
      'Pillar DIC extracts rules, deadlines, contacts, and structure. You see a confidence score per document. No black boxes.',
  },
  {
    n: '03',
    Icon: MessageCircleQuestion,
    title: 'Ask your first question',
    body:
      'Covenant Brain answers in plain English, citing the exact section. The "aha" usually arrives inside 15 minutes.',
  },
  {
    n: '04',
    Icon: Users,
    title: 'Roll out to the board',
    body:
      'Invite the rest of the board. We send them a 2-minute tour. The first violation notice goes out the same week.',
  },
]

export function HowItWorks() {
  return (
    <section className="bg-ink-900 py-24 text-white md:py-32" id="how-it-works">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-ember-400">
            How it works
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            From PDF pile to working AI in an afternoon.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-300">
            No migration, no implementation team. The four steps are designed
            for a volunteer board on a Tuesday night.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-ember-500 text-white">
                  <s.Icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-xs text-ink-400">{s.n}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
