import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, Clock } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { FaqList } from '@/components/site/faq'
import { PricingSlab } from '@/components/site/pricing-slab'
import { HeroCtas } from '@/components/site/hero-ctas'
import { ApprovalsScreen, AskScreen, DuesScreen } from '@/components/site/tour-screens'
import { RoiCalculator } from '@/components/site/roi-calculator'
import { HOA_PLANS, HOA_PRICE_COPY, PRICING_V2, TRIAL_DAYS } from '@/lib/hoa-pricing'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { STATE_COVERAGE_SENTENCE, STATE_LAW_ANSWERS_NOTE } from '@/lib/state-law'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/pricing']!, path: '/pricing' })

// Two plans, Essentials and Complete, in size bands. Every number comes from
// lib/hoa-pricing.ts, which a unit test pins to what Stripe checkout charges.
//
// Truth rule (BL-002, BL-042): every item below maps to a shipped route in
// apps/hoa. Anything not built yet goes under "Coming soon", and only if it
// is on docs/backlog.md. `complete: true` = only on Complete
// (docs/decisions/2026-10-20-pricing.md section 1).
type Item = { text: string; complete?: true }
const INCLUDED: Array<{ area: string; items: Item[] }> = [
  {
    area: 'Ask and understand',
    items: [
      { text: 'AI Daily Digest + Compliance Heat Map' }, // (dashboard)/page.tsx
      { text: 'Ask your governing documents and get cited answers' }, // /ai/ask, W1
      { text: '⌘K record search, built-in user guide and Ask the guide' }, // /api/search, /help, /api/help/ask
    ],
  },
  {
    area: 'Rules and requests',
    items: [
      { text: 'Violation letters drafted from photos, approved or rejected in one click' }, // /violations/new, /approvals, W3
      { text: 'AI ARC review: resident pre-check, cited board review, decision letters' }, // /arc, /resident/arc/new
    ],
  },
  {
    area: 'Meetings',
    items: [
      { text: 'Meeting minutes drafted from your transcript; board packet as of month end' }, // /meetings, /meetings/[id]/packet
      { text: 'State-law Compliance page, election planner and annual meeting kit' }, // /compliance, /meetings/[id]/election
    ],
  },
  {
    area: 'Communication',
    items: [
      { text: 'Announcements drafted from a sentence, phone preview, street audiences, scheduled sends and templates' }, // /communications/new
      { text: 'Spanish version of announcements, reviewed by the board before sending' }, // BL-025
      { text: 'Message results by home, with a reminder to those who haven’t opened' }, // /communications/[id]
      { text: 'Shared Gmail inbox with AI reply drafts, saved replies and Create from email', complete: true }, // /inbox, W32
    ],
  },
  {
    area: 'Money',
    items: [
      { text: 'Accounting: general ledger, bank feeds, reconciliation', complete: true }, // /accounting
      { text: 'AI bill scan into the approvals queue', complete: true }, // /accounting/invoices/new, W36
      { text: 'Month-end board report, emailed on the 1st', complete: true }, // BL-073
      { text: 'Late-fee policy the board sets, held to the state cap', complete: true }, // /settings/late-fees
      { text: 'Collections letters (GA, FL, CA, TX), estoppel and resale certificates and the owner budget notice', complete: true }, // /properties/[id]/collections-letter
    ],
  },
  {
    area: 'Vendors',
    items: [{ text: 'Vendor onboarding, RFPs and AI bid comparison', complete: true }], // /vendors, /rfps
  },
  {
    area: 'State law',
    items: [
      { text: 'State law built in (GA, FL, CA, TX), including Georgia’s SB 406 registration kit, quorum and proxy rules, and the annual report for owners' }, // /compliance/ga-registration
    ],
  },
  {
    area: 'Residents',
    items: [
      { text: 'Resident portal: dues balance, ARC, requests, documents' }, // /resident
      { text: 'Resident assistant that answers from the resident’s account and your documents, cited' }, // /resident/ask
    ],
  },
  {
    area: 'Setup and data',
    items: [
      { text: 'Roster import from CSV or Excel, CINC exports included' }, // /properties/import
      { text: 'Download all your data any time, as spreadsheets' }, // /settings/data, BL-011
    ],
  },
]

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
  { item: 'Feature add-ons', cost: 'None', note: 'Two plans. No per-feature charges on top.' },
  { item: 'Paying for a year', cost: '2 months free', note: 'Yearly is 10 months billed for 12.' },
  { item: 'Cancelling', cost: 'Free', note: 'Month to month. Cancel in Settings, Billing.' },
  { item: 'Online card and bank payments', cost: 'Coming soon', note: 'Not available yet, so there is no fee to list.' },
]

const faqs = [
  {
    q: 'How does the free trial work?',
    a: `Every HOA gets ${TRIAL_DAYS} days free to actually use the product. No card is needed to start and there is no data migration. Before the trial ends, the board decides whether to continue. A board that continues moves to ${PRICING_V2 ? 'one of the plans above' : 'the per-door plan above'}.`,
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

        <section className="section scroll-mt-20" id="included" aria-labelledby="included-h">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">What’s included</p>
              <h2 id="included-h" className="t-h2 mt-4 text-foreground">
                Everything your board can use today.
              </h2>
              <p className="t-lead mt-4">
                Essentials has the core. Complete adds the books and the mailbox. Items marked Complete are only on that plan.
              </p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-2">
              {INCLUDED.map((g) => (
                <div key={g.area} className="card p-7">
                  <h3 className="t-h3 text-foreground">{g.area}</h3>
                  <ul className="mt-4 space-y-3">
                    {g.items.map((it) => (
                      <li key={it.text} className="flex gap-2.5 text-base text-foreground-secondary">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />
                        <span>
                          {it.text}
                          {it.complete && (
                            <span className="ml-2 inline-block rounded-full bg-primary-subtle px-2 py-0.5 text-sm font-semibold text-primary">
                              Complete
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="card p-7">
                <h3 className="t-h3 text-foreground">Coming soon</h3>
                <p className="mt-2 text-base text-muted">Not available yet.</p>
                <ul className="mt-4 space-y-3">
                  {COMING_SOON.map((r) => (
                    <li key={r} className="flex gap-2.5 text-base text-muted">
                      <Clock className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-8 text-center text-base text-muted">
              Plans start from {HOA_PLANS.map((p) => `${p.name} ${p.price}${p.period}`).join(' and ')}.
            </p>
          </div>
        </section>

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
