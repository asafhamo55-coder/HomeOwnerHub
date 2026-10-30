import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OTHER_HUBS_ENABLED } from '@/lib/hubs'
import { HOA_PLANS, HOA_PRICE_COPY, PRICING_V2, type HoaPlan } from '@/lib/hoa-pricing'

// Homepage teaser. The plans and every price come from lib/hoa-pricing.ts,
// the same source /pricing renders, so the two can't disagree (BL-042).
// The bullets name shipped features only; /pricing has the full list.
// essentials / complete render only once PRICING_V2 is on (BL-104).
const TEASER_BULLETS: Record<HoaPlan['id'], string[]> = {
  monthly: [
    'Ask your governing documents and get cited answers',
    'Violation letters drafted from photos, approved in one click',
    'Accounting, bank feeds and AI bill scan',
    'Month-end board report and resident portal',
  ],
  annual: ['Everything in HOA Monthly, same product', 'Paid once a year'],
  essentials: [
    'Ask your governing documents and get cited answers',
    'Violation letters drafted from photos, approved in one click',
    'Dues, resident portal and announcements',
  ],
  complete: [
    'Everything in Essentials',
    'Accounting, bank feeds and AI bill scan',
    'Shared inbox with AI reply drafts, vendors and RFPs',
  ],
}

const TEASER_HEADLINE = PRICING_V2 ? HOA_PRICE_COPY.headline : 'One price per door. Every feature included.'

export function PricingTeaser() {
  return (
    <section className="section scroll-mt-16 bg-surface" id="pricing">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Pricing built for volunteers</p>
          <h2 className="t-h2 mt-4 text-foreground">{TEASER_HEADLINE}</h2>
          <p className="t-lead mt-5">
            HOAs pay {HOA_PRICE_COPY.summary} Every pilot gets six months free.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl gap-5 md:grid-cols-2">
          {HOA_PLANS.map((t) => (
            <div
              key={t.name}
              className={cn(
                'relative flex flex-col rounded-[1.25rem] border p-7 md:p-8',
                t.featured
                  ? 'border-primary/40 bg-gradient-to-br from-primary-subtle via-surface to-surface shadow-[0_28px_60px_-34px_hsl(var(--primary)/0.6)]'
                  : 'border-border bg-surface',
              )}
            >
              {t.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-fg">
                  Best value
                </span>
              )}
              <p className="text-base font-semibold text-foreground">{t.name}</p>
              <p className="mt-1 text-sm text-muted">{t.sub}</p>
              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="text-5xl font-semibold tracking-[-0.03em] text-foreground">{t.price}</span>
                <span className="text-sm text-muted">{t.period}</span>
              </div>
              <ul className="mt-7 flex-1 space-y-3">
                {TEASER_BULLETS[t.id].map((b) => (
                  <li key={b} className="flex gap-2.5 text-[15px] text-foreground-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/demo"
                className={cn('btn mt-8', t.featured ? 'btn-primary' : 'btn-secondary')}
              >
                {t.cta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted">
          {OTHER_HUBS_ENABLED
            ? 'PM Hub free tier (1 property). Eviction is priced per case. Full pricing → '
            : 'Full pricing → '}
          <Link href="/pricing" className="font-semibold text-foreground underline-offset-4 hover:underline">
            see all plans
          </Link>
        </p>
      </div>
    </section>
  )
}
