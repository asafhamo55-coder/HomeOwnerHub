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
      'Bill scan reads vendor bills into the approvals queue',
      'AI drafts board minutes from your meeting transcript',
    ],
    accent: 'from-success-subtle to-surface',
    iconBg: 'bg-success-subtle text-success',
    border: 'border-success/15',
    chip: 'bg-success-subtle text-success ring-success/15',
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
    accent: 'from-accent-subtle to-surface',
    iconBg: 'bg-accent-subtle text-accent-fg',
    border: 'border-accent/15',
    chip: 'bg-accent-subtle text-accent-fg ring-accent/15',
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
    accent: 'from-eviction-subtle to-surface',
    iconBg: 'bg-eviction-subtle text-eviction',
    border: 'border-eviction/15',
    chip: 'bg-eviction-subtle text-eviction ring-eviction/15',
    cta: 'Tour Eviction Hub',
  },
]

export function Products() {
  return (
    <section className="bg-subtle/40 py-24 md:py-32" id="products">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Three products. One identity.
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Same buyer, different life stages. One platform for all of it.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
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

              <h3 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
                {p.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{p.headline}</p>

              <ul className="mt-5 space-y-2.5">
                {p.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-[13px] leading-relaxed text-foreground-secondary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                    {b}
                  </li>
                ))}
              </ul>

              <Link
                href={`/${p.slug}`}
                className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors group-hover:text-primary"
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
