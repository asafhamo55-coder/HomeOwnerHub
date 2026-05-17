'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function CtaCloser() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-white to-ember-50/70" />
      <div className="absolute inset-0 -z-10 grid-bg opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <div className="container-page">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-6xl">
            Stop volunteering for paperwork.
            <br />
            Start governing.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
            Ten minutes. We load your CC&R, run Covenant Brain on your real
            rules, and let your board decide.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/demo"
              className="group inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-ink-800 hover:shadow-md"
            >
              Book a demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/roadmap"
              className="text-sm font-medium text-ink-700 hover:text-ink-900"
            >
              Or read the public roadmap →
            </Link>
          </div>
          <p className="mt-8 text-xs text-ink-500">
            Six-month free pilot · No data migration · Built in Atlanta
          </p>
        </motion.div>
      </div>
    </section>
  )
}
