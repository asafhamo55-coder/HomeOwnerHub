import type { Metadata } from 'next'
import { Check, Clock, HelpCircle, Minus, X } from 'lucide-react'
import { HeroCtas } from '@/components/site/hero-ctas'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { cn } from '@/lib/cn'
import {
  CHECKED_LABEL,
  COMPETITORS,
  FEATURE_LABELS,
  OURS,
  OUR_GAPS,
  OUR_PRICE,
  audienceLabel,
  type CellState,
  type Competitor,
  type FeatureKey,
} from '@/lib/competitors'
import { TRIAL_DAYS } from '@/lib/hoa-pricing'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/compare']!, path: '/compare' })

type BadgeState = CellState | 'soon'

const BADGE: Record<BadgeState, { label: string; cls: string; Icon: typeof Check }> = {
  yes: { label: 'Yes', cls: 'bg-success-subtle text-success ring-success/20', Icon: Check },
  partial: { label: 'Partly', cls: 'bg-warning-subtle text-foreground ring-warning/30', Icon: Minus },
  soon: { label: 'Not yet', cls: 'bg-primary-subtle text-primary ring-primary/25', Icon: Clock },
  'not-confirmed': { label: 'Not confirmed', cls: 'bg-subtle text-foreground-secondary ring-border', Icon: HelpCircle },
  no: { label: 'No', cls: 'bg-subtle text-foreground ring-border', Icon: X },
}

function Badge({ state }: { state: BadgeState }) {
  const { label, cls, Icon } = BADGE[state]
  return (
    <span className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-base font-semibold ring-1', cls)}>
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </span>
  )
}

const FEATURE_ORDER: FeatureKey[] = ['payments', 'accounting', 'portal', 'violationsArc', 'ai', 'lawCitations', 'trial']
const TABLE_FEATURES: FeatureKey[] = ['payments', 'accounting', 'portal', 'violationsArc', 'ai', 'trial']

const usd = (n: number) => `$${n}`

const CHOICES = [
  {
    title: 'Hire a management company',
    body: 'A firm does the paperwork for a fee it quotes you. You keep the board votes. Most firms run their own software, so you will not pick the tool.',
  },
  {
    title: 'Use software made for self-managed boards',
    body: 'The board runs the HOA with a tool built for volunteers. Prices are published, and most offer a trial. This is where HomeownerHub sits, next to PayHOA, HOA Express and others below.',
  },
  {
    title: 'Use software made for management companies',
    body: 'Powerful, but sold to firms, usually by quote and after a demo. Fine if your manager uses it. A volunteer board starting from scratch will find it heavy.',
  },
]

function PriceBlock() {
  return (
    <section className="section-warm section" aria-labelledby="our-price-h">
      <div className="container-page">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow">Our price</p>
          <h2 id="our-price-h" className="t-h2 mt-3 text-foreground">One plan, every feature, priced by size.</h2>
          <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-foreground-secondary">
            Accounting, violations, architectural review, the AI helper and the resident app are all in the one price.
            Pay yearly and get {OUR_PRICE.yearlyFreeMonths} months free. The trial is {TRIAL_DAYS} days with no card.
          </p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {OUR_PRICE.tiers.map((t) => (
              <div key={t.homes} className="card p-4">
                <dt className="text-base text-foreground-secondary">{t.homes}</dt>
                <dd className="mt-1 text-[24px] font-semibold text-foreground">{usd(t.monthlyUsd)}<span className="text-base font-normal text-foreground-secondary"> a month</span></dd>
              </div>
            ))}
            <div className="card p-4">
              <dt className="text-base text-foreground-secondary">401 homes or more</dt>
              <dd className="mt-1 text-[24px] font-semibold text-foreground">${OUR_PRICE.overFourHundredPerHomeUsd.toFixed(2)}<span className="text-base font-normal text-foreground-secondary"> per home a month</span></dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

function OurColumnCard() {
  return (
    <article className="card border-primary/30 bg-primary-subtle/40 p-5 md:p-6" aria-labelledby="hh-card-h">
      <p className="eyebrow">Built for self-managed boards</p>
      <h3 id="hh-card-h" className="t-h3 mt-2 text-foreground">HomeownerHub</h3>
      <p className="mt-2 text-[18px] leading-snug text-foreground-secondary">From {usd(OUR_PRICE.tiers[0]!.monthlyUsd)} a month for up to 50 homes. Published price.</p>
      <dl className="mt-4 space-y-3">
        {FEATURE_ORDER.map((k) => (
          <div key={k}>
            <dt className="text-base font-semibold text-foreground">{FEATURE_LABELS[k]}</dt>
            <dd className="mt-1">
              <Badge state={OURS[k].state === 'no' ? 'no' : OURS[k].state} />
              <p className="mt-1.5 text-[18px] leading-snug text-foreground-secondary">{OURS[k].note}</p>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-[18px] leading-snug text-foreground">
        <span className="font-semibold">Best for:</span> boards that want one price with accounting, violations, architectural review and cited answers from their own documents, and can collect dues by Zelle or check for now.
      </p>
    </article>
  )
}

function CompetitorCard({ c }: { c: Competitor }) {
  return (
    <article className="card p-5 md:p-6" aria-labelledby={`${c.id}-h`}>
      <p className="eyebrow">{audienceLabel(c.audience)}</p>
      <h3 id={`${c.id}-h`} className="t-h3 mt-2 text-foreground">{c.name}</h3>
      <p className="mt-1 text-[18px] leading-snug text-foreground-secondary">{c.audienceNote}</p>
      <p className="mt-3 text-[20px] font-semibold text-foreground">{c.startingPrice}</p>
      {c.priceNote && <p className="mt-1 text-base leading-snug text-foreground-secondary">{c.priceNote}</p>}
      <dl className="mt-4 space-y-3">
        {FEATURE_ORDER.map((k) => {
          const cell = c.features[k]
          return (
            <div key={k}>
              <dt className="text-base font-semibold text-foreground">{FEATURE_LABELS[k]}</dt>
              <dd className="mt-1">
                <Badge state={cell.state} />
                {cell.note && <p className="mt-1.5 text-[18px] leading-snug text-foreground-secondary">{cell.note}</p>}
              </dd>
            </div>
          )
        })}
      </dl>
      <p className="mt-5 text-[18px] leading-snug text-foreground">
        <span className="font-semibold">Best for:</span> {c.bestFor}
      </p>
      <p className="mt-3 text-base text-muted">
        Source:{' '}
        {c.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ', '}
            <a href={s.url} rel="noopener noreferrer nofollow" target="_blank" className="font-medium text-primary underline underline-offset-4">
              {new URL(s.url).hostname.replace(/^www\./, '')}
            </a>
          </span>
        ))}
        . Checked {CHECKED_LABEL}.
      </p>
    </article>
  )
}

function ComparisonTable() {
  return (
    <div className="card hidden overflow-hidden xl:block">
      <table className="w-full table-fixed text-left text-[16px]">
        <caption className="sr-only">HOA software compared: who it is for, starting price, and what each company publishes</caption>
        <thead>
          <tr className="border-b border-border bg-subtle/40">
            <th scope="col" className="w-[13%] px-3 py-3 text-base font-semibold">Product</th>
            <th scope="col" className="w-[13%] px-3 py-3 text-base font-semibold">Built for</th>
            <th scope="col" className="w-[13%] px-3 py-3 text-base font-semibold">Starting price</th>
            {TABLE_FEATURES.map((k) => (
              <th key={k} scope="col" className="px-3 py-3 text-base font-semibold">{FEATURE_LABELS[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border bg-primary-subtle/40 align-top">
            <th scope="row" className="px-3 py-4 text-[18px] font-semibold text-primary">HomeownerHub</th>
            <td className="px-3 py-4">Self-managed boards</td>
            <td className="px-3 py-4 font-semibold">From {usd(OUR_PRICE.tiers[0]!.monthlyUsd)} a month</td>
            {TABLE_FEATURES.map((k) => (
              <td key={k} className="px-3 py-4"><Badge state={OURS[k].state} /></td>
            ))}
          </tr>
          {COMPETITORS.map((c) => (
            <tr key={c.id} className="border-t border-border align-top">
              <th scope="row" className="px-3 py-4 text-[18px] font-semibold text-foreground">{c.name}</th>
              <td className="px-3 py-4">{audienceLabel(c.audience)}</td>
              <td className="px-3 py-4">{c.startingPrice}</td>
              {TABLE_FEATURES.map((k) => (
                <td key={k} className="px-3 py-4"><Badge state={c.features[k].state} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ComparePage() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <PageHero
          eyebrow="Compare HOA software"
          title={
            <>
              Which kind of help does your board <span className="t-serif text-primary">actually need?</span>
            </>
          }
          subtitle={`A plain look at the HOA software market for a board of volunteers. We list what each company publishes on its own site, say where one of them is the better choice, and mark anything we could not confirm. Prices as of ${CHECKED_LABEL}.`}
        />

        <section className="pb-8 pt-2" aria-labelledby="choices-h">
          <div className="container-page">
            <div className="mx-auto max-w-5xl">
              <h2 id="choices-h" className="t-h2 text-foreground">Your board has three choices</h2>
              <ol className="mt-6 grid gap-5 md:grid-cols-3">
                {CHOICES.map((c, i) => (
                  <li key={c.title} className="card flex gap-4 p-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-lg font-semibold text-primary" aria-hidden>{i + 1}</span>
                    <div>
                      <h3 className="text-[20px] font-semibold leading-snug text-foreground">{c.title}</h3>
                      <p className="mt-2 text-[18px] leading-relaxed text-foreground-secondary">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <PriceBlock />

        <section className="section" aria-labelledby="table-h">
          <div className="container-page">
            <div className="mx-auto max-w-5xl">
              <h2 id="table-h" className="t-h2 text-foreground">Side by side</h2>
              <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-foreground-secondary">
                Yes means the company says so on its own site. Partly means only part of it is stated. Not confirmed means we could not find it, which is not the same as no. Not yet means we do not have it live.
              </p>
            </div>
            <div className="mt-8">
              <ComparisonTable />
              <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 xl:hidden">
                <OurColumnCard />
                {COMPETITORS.map((c) => (
                  <CompetitorCard key={c.id} c={c} />
                ))}
              </div>
            </div>
            <div className="mx-auto mt-10 max-w-5xl rounded-2xl border border-border p-6">
              <h3 className="t-h3 text-foreground">What HomeownerHub does not have yet</h3>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-[18px] leading-relaxed text-foreground-secondary">
                {OUR_GAPS.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <p className="mt-4 text-[18px] leading-relaxed text-foreground-secondary">
                If collecting dues by card this month is the first thing your board needs, look at PayHOA or HOA Start first.
              </p>
            </div>
          </div>
        </section>

        <section className="section section-warm" aria-labelledby="notes-h">
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <h2 id="notes-h" className="t-h2 text-foreground">How to read this page</h2>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-[18px] leading-relaxed text-foreground-secondary">
                <li>Prices as of {CHECKED_LABEL}. Prices and features change, so check each company's own site before you decide.</li>
                <li>Competitor details come from each company's public pages, read on {CHECKED_LABEL}. We did not use their logos, text or images.</li>
                <li>Where a price is not public we say "Ask them for a price" and do not guess.</li>
                <li>Some products are made for management companies. We say so on each card.</li>
                <li>Our column describes only what works in HomeownerHub today.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section section-ink">
          <div className="container-page text-center">
            <p className="eyebrow">Next step</p>
            <h2 className="t-h2 mx-auto mt-4 max-w-2xl text-foreground">Ten minutes. Your CC&R. Your board.</h2>
            <div className="flex flex-col items-center">
              <HeroCtas position="closing" checks={false} secondaryLabel="Book a demo" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
