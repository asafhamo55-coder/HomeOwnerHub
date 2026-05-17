import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { RoiCalculator } from '@/components/site/roi-calculator'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Pricing — Less than a management company',
  description:
    'HOA from $39/mo. PM free tier or $19–$49/mo. Eviction $99–$199 per case. Six-month free pilot for HOAs.',
}

const hoaTiers = [
  {
    name: 'HOA Starter',
    price: '$39',
    period: '/mo',
    sub: '≤ 50 doors',
    bullets: ['Onboarding Agent', 'Covenant Brain', 'Resident portal (read-only)', 'Multilingual comms', 'Daily Digest'],
    cta: 'Pilot for free',
  },
  {
    name: 'HOA Standard',
    price: '$79',
    period: '/mo',
    sub: '51–300 doors · Most boards',
    bullets: [
      'Everything in Starter',
      'Violation Drafter (Bar B)',
      'Minutes Engine (Bar B)',
      'Reserve Live (Bar B)',
      'Vendor Oracle',
      'ARC Recommender',
    ],
    cta: 'Book a demo',
    featured: true,
  },
  {
    name: 'HOA Plus',
    price: '$149',
    period: '/mo',
    sub: '301–1,000 doors',
    bullets: [
      'Everything in Standard',
      'Board Copilot (Bar B)',
      'White-label resident portal',
      'Compliance Heat Map',
      'Priority support + monthly review',
    ],
    cta: 'Talk to us',
  },
]

const pmTiers = [
  {
    name: 'PM Free',
    price: '$0',
    period: '/mo',
    sub: '1 property',
    bullets: ['Rent tracking (manual)', 'Lease Q&A (Bar C)', 'Tenant portal', 'Email notifications'],
    cta: 'Start free',
  },
  {
    name: 'PM Investor',
    price: '$19',
    period: '/mo',
    sub: '2–10 units',
    bullets: [
      'Zero-touch rent collection (ACH + card)',
      'Delinquency Coach (day 5–30)',
      'Auto late fees per state',
      'Multilingual tenant comms',
    ],
    cta: 'Start trial',
    featured: true,
  },
  {
    name: 'PM Pro',
    price: '$49',
    period: '/mo',
    sub: '11–50 units',
    bullets: [
      'Everything in Investor',
      'Predictive Maintenance',
      'Budget Anomaly Detection',
      'Vendor management',
      'Bookkeeping export',
    ],
    cta: 'Book a demo',
  },
]

const evictionTiers = [
  {
    name: 'Eviction Notice',
    price: '$99',
    period: '/case',
    sub: 'Day 5–30 work',
    bullets: [
      'County-specific notices (Bar B)',
      'Attorney review queue',
      'Certified mail dispatch',
      'Audit trail',
    ],
    cta: 'Join waitlist',
  },
  {
    name: 'Eviction Filing',
    price: '$199',
    period: '/case',
    sub: 'Full demo filing package',
    bullets: [
      'Everything in Notice',
      'Court-filing templates (Bar A · demo)',
      'Timeline tracker through hearing',
      'Attorney handoff package',
    ],
    cta: 'Join waitlist',
    featured: true,
  },
]

const faqs = [
  {
    q: 'What\'s the six-month free pilot for HOAs?',
    a: 'Every HOA gets six months free to actually use the product. No data migration, no auto-conversion. After six months, we walk through usage, share metrics, and let the board decide. Most pilots convert at the standard tier.',
  },
  {
    q: 'What does "Bar A / B / C" mean on the pricing list?',
    a: 'Bar C is production-ready. Bar B is functional but requires a human review gate before output is sent. Bar A is demo-only — useful for education but never used in live workflows without explicit attorney or board sign-off. Every workflow ships at its labeled bar; no hidden risk.',
  },
  {
    q: 'Do we keep our data?',
    a: 'Yes. You own everything you upload. We never train on your documents. Export is one-click in any plan, including free.',
  },
  {
    q: 'What if my HOA is in a state you don\'t support yet?',
    a: 'HOA Hub launches in Georgia. We add states as we onboard customers there — Charlotte / Raleigh / Nashville / Tampa / Orlando are next. If you want us to add yours, get on a demo and tell us.',
  },
  {
    q: 'Is eviction legal in v1?',
    a: 'Court-filing templates are Bar A — demo only, watermarked, and not for filing. A Georgia attorney reviews every output and files the real thing. We open Bar B per county only after attorney sign-off.',
  },
]

export default function PricingPage() {
  return (
    <main>
      <Nav />

      <section className="relative overflow-hidden pt-32 pb-12">
        <div className="absolute inset-0 -z-10 bg-radial-spot" />
        <div className="container-page text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            Pricing
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-[56px] md:leading-[1.05]">
            One management company quote = 18 months of Ledger.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
            HOAs pay per month. Landlords start free. Evictions are per-case.
            Every workflow is labeled by its quality bar.
          </p>
        </div>
      </section>

      <PricingBlock
        eyebrow="HOA Hub"
        title="Built for volunteer boards"
        accent="emerald"
        tiers={hoaTiers}
      />

      <RoiCalculator />


      <PricingBlock
        eyebrow="PM Hub"
        title="Free for one. Cheap for a few. Honest for many."
        accent="ember"
        tiers={pmTiers}
      />

      <PricingBlock
        eyebrow="Eviction Hub"
        title="Per-case. Attorney-reviewed."
        accent="violet"
        tiers={evictionTiers}
      />

      <section className="py-24 md:py-32" id="faq">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">FAQ</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
              Common questions.
            </h2>
          </div>

          <div className="mx-auto mt-12 max-w-3xl divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70 bg-white ring-card">
            {faqs.map((f) => (
              <details key={f.q} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-left text-base font-semibold text-ink-900">
                  {f.q}
                  <span className="text-ink-400 transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{f.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Link
              href="/demo"
              className="group inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-ink-800"
            >
              Book a demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function PricingBlock({
  eyebrow,
  title,
  accent,
  tiers,
}: {
  eyebrow: string
  title: string
  accent: 'emerald' | 'ember' | 'violet'
  tiers: {
    name: string
    price: string
    period: string
    sub: string
    bullets: string[]
    cta: string
    featured?: boolean
  }[]
}) {
  const accentMap = {
    emerald: { text: 'text-emerald-700', ring: 'border-emerald-200', bg: 'from-emerald-50/70' },
    ember: { text: 'text-ember-700', ring: 'border-ember-200', bg: 'from-ember-50/70' },
    violet: { text: 'text-violet-700', ring: 'border-violet-200', bg: 'from-violet-50/70' },
  }[accent]

  return (
    <section className="border-t border-ink-200/60 py-20">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className={cn('text-sm font-semibold uppercase tracking-wider', accentMap.text)}>
            {eyebrow}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            {title}
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={cn(
                'relative flex flex-col rounded-2xl border p-7 ring-card transition-all',
                t.featured
                  ? cn('bg-gradient-to-br to-white', accentMap.ring, accentMap.bg)
                  : 'border-ink-200/70 bg-white',
              )}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Popular
                </span>
              )}
              <p className="text-sm font-semibold text-ink-900">{t.name}</p>
              <p className="mt-1 text-xs text-ink-500">{t.sub}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight text-ink-900">
                  {t.price}
                </span>
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
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
