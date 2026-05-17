'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowUpRight, Building2, Home, Scale } from 'lucide-react'
import { cn } from '@/lib/cn'

const products = [
  {
    slug: 'hoa',
    name: 'HOA Hub',
    tag: 'For volunteer boards',
    Icon: Building2,
    headline: 'Run a self-managed HOA without a management company.',
    bullets: [
      'Covenant Brain answers any rule question with citations',
      'Violation Drafter writes notices the board approves in seconds',
      'Reserve Live keeps your reserve fund honest in real time',
      'Minutes Engine ships board minutes the night of the meeting',
    ],
    accent: 'from-emerald-50 to-white',
    iconBg: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-100',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    cta: 'Tour HOA Hub',
  },
  {
    slug: 'landlords',
    name: 'PM Hub',
    tag: 'For small landlords',
    Icon: Home,
    headline: 'Rent that collects itself. A coach for everything else.',
    bullets: [
      'Zero-touch rent collection on every unit',
      'Delinquency Coach catches late rent before it spirals',
      'Lease Q&A answers tenant questions in plain English',
      'Predictive maintenance flags problems before they break',
    ],
    accent: 'from-ember-50 to-white',
    iconBg: 'bg-ember-100 text-ember-700',
    border: 'border-ember-100',
    chip: 'bg-ember-50 text-ember-700 ring-ember-100',
    cta: 'Tour PM Hub',
  },
  {
    slug: 'eviction',
    name: 'Eviction Hub',
    tag: 'For when it goes wrong',
    Icon: Scale,
    headline: 'Guided eviction support, attorney-reviewed.',
    bullets: [
      'County-specific notices generated in the right format',
      'Every template reviewed by a Georgia attorney',
      'Full audit trail for legal defensibility',
      'Demo-only filings — your lawyer files the real thing',
    ],
    accent: 'from-violet-50 to-white',
    iconBg: 'bg-violet-100 text-violet-700',
    border: 'border-violet-100',
    chip: 'bg-violet-50 text-violet-700 ring-violet-100',
    cta: 'Tour Eviction Hub',
  },
]

export function Products() {
  return (
    <section className="bg-ink-50/40 py-24 md:py-32" id="products">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            Three products. One identity.
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Same buyer, different life stages. One platform for all of it.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            Most people who run an HOA also rent out a property. And when a
            tenancy breaks down, they need the legal piece too. We're the only
            platform that follows them through every stage.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {products.map((p, i) => (
            <motion.div
              key={p.slug}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b p-7 transition-all ring-card',
                p.border,
                p.accent,
              )}
            >
              <div className="flex items-start justify-between">
                <div className={cn('inline-flex h-11 w-11 items-center justify-center rounded-xl', p.iconBg)}>
                  <p.Icon className="h-5 w-5" />
                </div>
                <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1', p.chip)}>
                  {p.tag}
                </span>
              </div>

              <h3 className="mt-6 text-xl font-semibold tracking-tight text-ink-900">
                {p.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{p.headline}</p>

              <ul className="mt-5 space-y-2.5">
                {p.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-[13px] leading-relaxed text-ink-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                    {b}
                  </li>
                ))}
              </ul>

              <Link
                href={`/${p.slug}`}
                className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-700"
              >
                {p.cta}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
