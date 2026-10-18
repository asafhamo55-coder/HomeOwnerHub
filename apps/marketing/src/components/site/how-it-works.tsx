'use client'

import { motion } from 'framer-motion'
import { Upload, ScanSearch, MessageCircleQuestion, Users } from 'lucide-react'

const steps = [
  {
    n: '01',
    Icon: Upload,
    title: 'Drop your documents',
    body:
      'Upload your CC&R, bylaws and rules as PDF, text or Markdown. A scanned PDF needs a text layer (OCR) first.',
  },
  {
    n: '02',
    Icon: ScanSearch,
    title: 'AI reads everything',
    body:
      'Each document is split into its sections and indexed, so every answer can point to the exact section it came from.',
  },
  {
    n: '03',
    Icon: MessageCircleQuestion,
    title: 'Ask your first question',
    body:
      'Covenant Brain answers in plain English, citing the exact section — and says so when your documents don’t cover it.',
  },
  {
    n: '04',
    Icon: Users,
    title: 'Bring in the board and the roster',
    body:
      'Invite the board, import your roster from a spreadsheet (CINC exports are recognised) and open the books in Accounting. The built-in guide walks each step.',
  },
]

export function HowItWorks() {
  return (
    <section className="bg-foreground py-24 text-background md:py-32" id="how-it-works">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            How it works
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            From PDF pile to working AI in an afternoon.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-background/70">
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
              className="relative rounded-2xl border border-background/10 bg-surface/[0.04] p-6 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-fg">
                  <s.Icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-xs text-muted">{s.n}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-background/70">
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
