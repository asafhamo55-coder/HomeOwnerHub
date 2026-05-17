'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/cn'

const tiers = [
  {
    name: 'HOA Starter',
    price: '$39',
    period: '/mo',
    sub: 'Up to 50 doors',
    bullets: ['Covenant Brain', 'Onboarding Agent', 'Resident portal'],
    cta: 'Pilot for free',
  },
  {
    name: 'HOA Standard',
    price: '$79',
    period: '/mo',
    sub: '51–300 doors · Most boards',
    bullets: ['Everything in Starter', 'Violation Drafter', 'Minutes Engine', 'Reserve Live', 'Vendor Oracle'],
    cta: 'Book a demo',
    featured: true,
  },
  {
    name: 'HOA Plus',
    price: '$149',
    period: '/mo',
    sub: '301–1,000 doors',
    bullets: ['Everything in Standard', 'Board Copilot', 'White-label resident portal', 'Priority support'],
    cta: 'Talk to us',
  },
]

export function PricingTeaser() {
  return (
    <section className="py-24 md:py-32" id="pricing">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            Pricing built for volunteers
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Less than a management company. By a lot.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            HOAs pay between $40 and $150 a month. Landlords start free. Eviction is per-case. Every pilot gets six months free.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={cn(
                'relative flex flex-col rounded-2xl border p-7 ring-card transition-all',
                t.featured
                  ? 'border-brand-200 bg-gradient-to-br from-brand-50/70 via-white to-ember-50/40'
                  : 'border-ink-200/70 bg-white',
              )}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Most boards
                </span>
              )}
              <p className="text-sm font-semibold text-ink-900">{t.name}</p>
              <p className="mt-1 text-xs text-ink-500">{t.sub}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight text-ink-900">{t.price}</span>
                <span className="text-sm text-ink-500">{t.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5">
                {t.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm text-ink-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/demo"
                className={cn(
                  'mt-7 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                  t.featured
                    ? 'bg-ink-900 text-white hover:bg-ink-800'
                    : 'border border-ink-200 bg-white text-ink-800 hover:bg-ink-50',
                )}
              >
                {t.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-ink-500">
          PM Hub free tier (1 property). Eviction $99–199 per case. Full pricing →{' '}
          <Link href="/pricing" className="font-semibold text-ink-800 underline-offset-4 hover:underline">
            see all plans
          </Link>
        </p>
      </div>
    </section>
  )
}
