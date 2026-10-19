import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, Clock, Sparkles } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { RoiCalculator } from '@/components/site/roi-calculator'
import { cn } from '@/lib/cn'
import { HOA_PLANS, HOA_PRICE_COPY, HOA_PRICING } from '@/lib/hoa-pricing'

export const metadata: Metadata = {
  title: `Pricing — ${HOA_PRICE_COPY.title}`,
  description: `HOA Hub: ${HOA_PRICE_COPY.summary} PM free tier or $19–$49/mo. Eviction $99–$199 per case.`,
}

// HOA per-door plan. One product; cadence (monthly vs annual) drives the
// price. Every number comes from lib/hoa-pricing.ts, which a unit test pins
// to what Stripe checkout charges, and which the homepage teaser also
// renders (BL-042).
//
// Truth rule (BL-002, BL-042): every bullet below maps to a shipped route in
// apps/hoa. Anything not built yet goes in `roadmap`, which renders under a
// "Roadmap" label — and only if it is on docs/backlog.md. Monthly and
// annual are the SAME product; the annual card must not imply extra
// features.
const HOA_FEATURES = [
  'AI Daily Digest + Compliance Heat Map', // (dashboard)/page.tsx
  'Ask your governing documents — cited answers', // /ai/ask, W1
  'Violation letters drafted from photos — approve or reject in one click', // /violations/new, /approvals, W3
  'Meeting minutes drafted from your transcript; board packet as of month end', // /meetings, /meetings/[id]/packet
  'Month-end board report, emailed on the 1st', // BL-073, /accounting/reports/monthly-report
  'Shared Gmail inbox with AI reply drafts', // /inbox, W32
  'Accounting: general ledger, bank feeds, reconciliation', // /accounting
  'AI bill scan into the approvals queue', // /accounting/invoices/new, W36
  'Vendor onboarding, RFPs and AI bid comparison', // /vendors, /rfps, W21–W23
  'AI ARC review: resident pre-check, cited board review, decision letters', // /arc, /resident/arc/new, BL-024/027/079
  'Spanish version of announcements, reviewed by the board before sending', // /communications/new, BL-025
  'Resident portal — dues balance, ARC, requests, documents', // /resident
  'Roster import from CSV or Excel, CINC exports included', // /properties/import
  '⌘K record search, built-in user guide and Ask the guide', // /api/search, /help, /api/help/ask
  'Download all your data any time, as spreadsheets', // /settings/data, BL-011
]

// Each item is a backlog entry (docs/backlog.md). Not available today.
// Spanish (BL-025) and AI ARC review (BL-024/027/079) shipped: they are in
// HOA_FEATURES above (BL-090).
const HOA_ROADMAP = [
  'Reserve fund tracking', // BL-037
]

const ANNUAL_BULLETS = [
  'Everything in HOA Monthly — same product',
  `${HOA_PRICING.ANNUAL_DISCOUNT_PCT}% off for paying a year up front`,
]

const hoaTiers = HOA_PLANS.map((p) =>
  p.cadence === 'monthly'
    ? { ...p, bullets: HOA_FEATURES, roadmap: HOA_ROADMAP }
    : { ...p, bullets: ANNUAL_BULLETS },
)

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
    a: 'Every HOA gets six months free to actually use the product. No data migration, no auto-conversion. After six months, we walk through usage, share metrics, and let the board decide. A board that continues moves to the per-door plan above.',
  },
  {
    q: 'Is there a contract?',
    a: `Both plans start with a ${HOA_PRICING.COMMIT_MONTHS}-month first year that can't be cancelled. From month ${HOA_PRICING.COMMIT_MONTHS + 1} you can cancel any time from Settings → Billing. The six-month pilot comes before that and never converts on its own.`,
  },
  {
    q: 'Can we bring our homeowner roster?',
    a: 'Yes, and the board does it itself. Properties → Import takes a CSV or Excel file (CINC exports are recognised), shows what will happen to every row before anything is saved, and lets you skip or update homes already on file. Balances in the file are shown for reference but never posted.',
  },
  {
    q: 'What does "Bar A / B / C" mean on the pricing list?',
    a: 'Bar C is production-ready. Bar B is functional but requires a human review gate before output is sent. Bar A is demo-only — useful for education but never used in live workflows without explicit attorney or board sign-off. Every workflow ships at its labeled bar; no hidden risk.',
  },
  {
    q: 'Do we keep our data?',
    a: 'Yes. You own everything you upload, and we never train on your documents. Board members and admins can download everything at any time from Settings → Your data: one zip with a spreadsheet (CSV) per area. Uploaded files themselves aren\'t in the zip; the documents list names each one.',
  },
  {
    q: 'What if my HOA is in a state you don\'t support yet?',
    a: 'Dues, violations, documents, accounting and the inbox work for an HOA in any state. The state-law assistant is the state-specific part: it covers Georgia today, and Florida (Chapter 720) is being added now. If you want yours next, get on a demo and tell us.',
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
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Pricing
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground md:text-[56px] md:leading-[1.05]">
            One price per door. No tiers, no add-ons.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            HOAs pay per door. Landlords start free. Evictions are per-case.
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
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">FAQ</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              Common questions.
            </h2>
          </div>

          <div className="mx-auto mt-12 max-w-3xl divide-y divide-border/70 rounded-2xl border border-border/70 bg-surface ring-card">
            {faqs.map((f) => (
              <details key={f.q} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-left text-base font-semibold text-foreground">
                  {f.q}
                  <span className="text-muted transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-foreground-secondary">{f.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Link
              href="/demo"
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-fg shadow-sm transition-all hover:bg-primary-hover"
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
    /** Not built yet; rendered under a "Roadmap" label, never with a check. */
    roadmap?: string[]
    cta: string
    featured?: boolean
  }[]
}) {
  const accentMap = {
    emerald: { text: 'text-success', ring: 'border-success/25', bg: 'from-success-subtle/70' },
    ember: { text: 'text-accent-fg', ring: 'border-accent/25', bg: 'from-accent-subtle/70' },
    violet: { text: 'text-eviction', ring: 'border-eviction/25', bg: 'from-eviction-subtle/70' },
  }[accent]

  return (
    <section className="border-t border-border/60 py-20">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className={cn('text-sm font-semibold uppercase tracking-wider', accentMap.text)}>
            {eyebrow}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
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
                  ? cn('bg-gradient-to-br to-surface', accentMap.ring, accentMap.bg)
                  : 'border-border/70 bg-surface',
              )}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-fg">
                  Popular
                </span>
              )}
              <p className="text-sm font-semibold text-foreground">{t.name}</p>
              <p className="mt-1 text-xs text-muted">{t.sub}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight text-foreground">
                  {t.price}
                </span>
                <span className="text-sm text-muted">{t.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5">
                {t.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm text-foreground-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {b}
                  </li>
                ))}
              </ul>
              {t.roadmap && t.roadmap.length > 0 ? (
                <div className="mt-6 border-t border-border/70 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Roadmap · not available yet
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {t.roadmap.map((r) => (
                      <li key={r} className="flex gap-2 text-sm text-muted">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
