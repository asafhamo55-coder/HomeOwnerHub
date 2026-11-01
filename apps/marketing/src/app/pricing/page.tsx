import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { FaqList } from '@/components/site/faq'
import { PricingSlab } from '@/components/site/pricing-slab'
import { HeroCtas } from '@/components/site/hero-ctas'
import { ApprovalsScreen, AskScreen, DuesScreen } from '@/components/site/tour-screens'
import { PlanCompare } from '@/components/site/plan-compare'
import { ReassuranceBand, ByHandStory } from '@/components/site/pricing-story'
import { RoiCalculator } from '@/components/site/roi-calculator'
import { HOA_PLANS, HOA_PRICE_COPY, PRICING_V2, TRIAL_DAYS } from '@/lib/hoa-pricing'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { STATE_COVERAGE_SENTENCE, STATE_LAW_ANSWERS_NOTE } from '@/lib/state-law'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/pricing']!, path: '/pricing' })

// Backlog items (docs/backlog.md). Not available today.
const COMING_SOON = [
  'Online card and bank payments: coming soon',
  'Reserve fund projections', // BL-037
  'Electronic ballots and written consent', // BL-156
]

// Plain fees. Only what is true today: checkout charges the plan price and
// nothing else (packages/billing). Card and ACH dues are not processed yet,
// so no payment fee is stated.
const FEES: Array<{ item: string; cost: string; note: string }> = [
  { item: 'Free trial', cost: 'Free', note: `${TRIAL_DAYS} days, no credit card to start.` },
  { item: 'Setup', cost: 'Free', note: 'No setup fee. The board imports its own roster from a spreadsheet.' },
  { item: 'Roster import', cost: 'Free', note: 'CSV or Excel, with a preview of every row before anything is saved.' },
  { item: 'Your data', cost: 'Free', note: 'Download everything as spreadsheets from Settings, any time.' },
  { item: 'Feature add-ons', cost: 'None', note: 'One plan with everything included. No per-feature charges on top.' },
  { item: 'Paying for a year', cost: '2 months free', note: 'Yearly is 10 months billed for 12.' },
  { item: 'Cancelling', cost: 'Free', note: 'Month to month. Cancel in Settings, Billing.' },
  { item: 'Online card and bank payments', cost: 'Coming soon', note: 'Not available yet, so there is no fee to list.' },
]

const faqs = [
  {
    q: 'How does the free trial work?',
    a: `Every HOA gets ${TRIAL_DAYS} days free to actually use the product. No card is needed to start and there is no data migration. Before the trial ends, the board decides whether to continue. A board that continues moves to ${PRICING_V2 ? 'the plan above' : 'the per-door plan above'}.`,
  },
  { q: 'Is there a contract?', a: HOA_PRICE_COPY.contract },
  {
    q: 'Can we bring our homeowner roster?',
    a: 'Yes, and the board does it itself. Properties → Import takes a CSV or Excel file (CINC exports are recognised), shows what will happen to every row before anything is saved, and lets you skip or update homes already on file. Balances in the file are shown for reference but never posted.',
  },
  {
    q: 'Do we keep our data?',
    a: 'Yes. You own everything you upload, and we never train on your documents. Board members and admins can download everything at any time from Settings → Your data: one zip with a spreadsheet (CSV) per area. Uploaded files themselves aren\'t in the zip; the documents list names each one.',
  },
  {
    q: 'What if my HOA is in a state you don\'t support yet?',
    a: `Dues, violations, documents, accounting, announcements and the inbox work for an HOA in any state. ${STATE_COVERAGE_SENTENCE} State-law answers: ${STATE_LAW_ANSWERS_NOTE} If you want yours next, get on a demo and tell us.`,
  },
  {
    q: 'Can residents pay dues online?',
    a: 'Not yet. Online card and bank payments are coming soon. Today the portal shows each owner their balance and statement, and the board records payments in the ledger.',
  },
]

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <PricingSlab
          headline={PRICING_V2 ? 'HOAs pay one flat price for their size.' : 'HOAs pay per door.'}
        />

        <ReassuranceBand />

        <PlanCompare comingSoon={COMING_SOON} />

        <section className="section-warm section" aria-labelledby="fees-h">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Fees</p>
              <h2 id="fees-h" className="t-h2 mt-4 text-foreground">
                What is free and what costs extra.
              </h2>
              <p className="t-lead mt-4">The plan price is the whole bill today.</p>
            </div>
            <div className="card mx-auto mt-12 max-w-3xl overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-base">
                <caption className="sr-only">Fees and what is free</caption>
                <thead>
                  <tr className="border-b border-border text-sm text-muted">
                    <th scope="col" className="px-6 py-4 font-semibold">Item</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Cost</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {FEES.map((f) => (
                    <tr key={f.item}>
                      <th scope="row" className="px-6 py-4 font-semibold text-foreground">{f.item}</th>
                      <td className="px-6 py-4 font-semibold text-foreground">{f.cost}</td>
                      <td className="px-6 py-4 text-foreground-secondary">{f.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <ByHandStory />

        <WhatYouGet />

        <RoiCalculator />

        <section className="section scroll-mt-16" id="faq">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">FAQ</p>
              <h2 className="t-h2 mt-4 text-foreground">Common questions.</h2>
            </div>
            <FaqList items={faqs} />
          </div>
        </section>

        <section className="section-ink section" aria-labelledby="pricing-cta-h">
          <div className="container-page">
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <h2 id="pricing-cta-h" className="t-h2 text-foreground">
                Try it with your own <span className="t-serif text-primary">documents.</span>
              </h2>
              <p className="t-lead mt-4">Start the trial, then ask a real question. Your board decides what goes out.</p>
              <div className="flex flex-col items-center">
                <HeroCtas position="closing" secondaryHref="/demo" secondaryLabel="Book a demo" />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

// "What you get" strip: three tour screens at half size, each linking to the
// full tour on the home page. Screens are decorative (aria-hidden); the
// caption carries the meaning. Fixed 640px design width scaled to 0.5 so
// nothing can overflow a 375px viewport.
const WHAT_YOU_GET = [
  { screen: <ApprovalsScreen />, title: 'Approvals', caption: 'Every AI draft waits here until a board member approves it.' },
  { screen: <DuesScreen />, title: 'Dues and credits', caption: 'Who has paid, who has a credit, and notices drafted from the ledger.' },
  { screen: <AskScreen />, title: 'Ask your documents', caption: 'Plain-English rule questions, answered with the section cited.' },
]

function WhatYouGet() {
  return (
    <section aria-labelledby="what-you-get-h" className="section">
      <div className="container-page">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="what-you-get-h" className="t-h3 text-foreground">
            What you get
          </h2>
          <Link href="/#features" className="inline-flex min-h-[44px] items-center gap-1 text-base font-semibold text-primary hover:underline">
            See the full tour
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <p className="mt-2 text-base text-muted">Sample screens with made-up data.</p>
        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {WHAT_YOU_GET.map((w) => (
            <li key={w.title} className="min-w-0">
              <Link href="/#features" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <div aria-hidden className="pointer-events-none h-[190px] w-full overflow-hidden rounded-xl border border-border/70 bg-subtle/60">
                  <div className="w-[640px] origin-top-left scale-50">{w.screen}</div>
                </div>
                <p className="mt-3 text-base font-semibold text-foreground group-hover:text-primary">{w.title}</p>
                <p className="mt-1 text-base leading-relaxed text-foreground-secondary">{w.caption}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
