'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, FileText } from 'lucide-react'

export function MidCta() {
  return (
    <section className="py-16 md:py-20">
      <div className="container-page">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-ink-200/70 bg-gradient-to-br from-white via-white to-brand-50/40 p-8 ring-card md:p-10"
        >
          <div className="grid items-center gap-8 md:grid-cols-[1.4fr,1fr]">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                Your board, week one
              </p>
              <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-ink-900 md:text-4xl md:leading-[1.1]">
                Send your CC&amp;R today. Watch your own rules answer back on Tuesday.
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-600 md:text-base">
                Ten-minute board demo, six-month free pilot, no auto-conversion.
                You decide on your timeline.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                href="/demo"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-ink-800 hover:shadow-md"
              >
                Book the 10-minute demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/roadmap"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50"
              >
                <FileText className="h-4 w-4 text-ink-500" />
                Read the public roadmap
              </Link>
              <p className="mt-1 text-center text-[11px] text-ink-500">
                Atlanta-metro pilot · 40% demo-to-pilot
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
