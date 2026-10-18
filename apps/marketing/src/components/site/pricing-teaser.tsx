'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { HOA_PLANS, HOA_PRICE_COPY, type HoaPlan } from '@/lib/hoa-pricing'

// Homepage teaser. The plans and every price come from lib/hoa-pricing.ts,
// the same source /pricing renders, so the two can't disagree (BL-042).
// The bullets name shipped features only; /pricing has the full list.
const TEASER_BULLETS: Record<HoaPlan['cadence'], string[]> = {
  monthly: [
    'Ask your governing documents — cited answers',
    'Violation letters drafted from photos, approved in one click',
    'Accounting, bank feeds and AI bill scan',
    'Month-end board report and resident portal',
  ],
  annual: ['Everything in HOA Monthly — same product', 'Paid once a year'],
}

export function PricingTeaser() {
  return (
    <section className="py-24 md:py-32" id="pricing">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Pricing built for volunteers
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            One price per door. Every feature included.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            HOAs pay {HOA_PRICE_COPY.summary} Every pilot gets six months free.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl gap-5 md:grid-cols-2">
          {HOA_PLANS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={cn(
                'relative flex flex-col rounded-2xl border p-7 ring-card transition-all',
                t.featured
                  ? 'border-primary/25 bg-gradient-to-br from-primary-subtle/70 via-surface to-accent-subtle/40'
                  : 'border-border/70 bg-surface',
              )}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-fg">
                  Best value
                </span>
              )}
              <p className="text-sm font-semibold text-foreground">{t.name}</p>
              <p className="mt-1 text-xs text-muted">{t.sub}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight text-foreground">{t.price}</span>
                <span className="text-sm text-muted">{t.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5">
                {TEASER_BULLETS[t.cadence].map((b) => (
                  <li key={b} className="flex gap-2 text-sm text-foreground-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/demo"
                className={cn(
                  'mt-7 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                  t.featured
                    ? 'bg-primary text-primary-fg hover:bg-primary-hover'
                    : 'border border-border bg-surface text-foreground hover:bg-subtle',
                )}
              >
                {t.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-muted">
          PM Hub free tier (1 property). Eviction is priced per case. Full pricing →{' '}
          <Link href="/pricing" className="font-semibold text-foreground underline-offset-4 hover:underline">
            see all plans
          </Link>
        </p>
      </div>
    </section>
  )
}
