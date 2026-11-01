import { Check, Clock } from 'lucide-react'
import Link from 'next/link'
import { SIGN_UP_URL } from './brand'

// One plan with every feature (docs/decisions/2026-11-01-one-plan.md). This
// section lists what is included; prices live in the slab above.
//
// Truth rule (BL-002, BL-042): every item below maps to a shipped route in
// apps/hoa. Anything not built yet goes under "Coming soon", and only if it
// is on docs/backlog.md.
type Item = { text: string }
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
      { text: 'Shared Gmail inbox with AI reply drafts, saved replies and Create from email' }, // /inbox, W32
    ],
  },
  {
    area: 'Money',
    items: [
      { text: 'Accounting: general ledger, bank feeds, reconciliation' }, // /accounting
      { text: 'AI bill scan into the approvals queue' }, // /accounting/invoices/new, W36
      { text: 'Month-end board report, emailed on the 1st' }, // BL-073
      { text: 'Late-fee policy the board sets, held to the state cap' }, // /settings/late-fees
      { text: 'Collections letters (GA, FL, CA, TX), estoppel and resale certificates and the owner budget notice' }, // /properties/[id]/collections-letter
    ],
  },
  {
    area: 'Vendors',
    items: [{ text: 'Vendor onboarding, RFPs and AI bid comparison' }], // /vendors, /rfps
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


export function PlanCompare({ comingSoon }: { comingSoon: string[] }) {
  return (
    <section className="section scroll-mt-20" id="included" aria-labelledby="included-h">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">What is included</p>
          <h2 id="included-h" className="t-h2 mt-4 text-foreground">
            Everything your board can use today.
          </h2>
          <p className="t-lead mt-4">One plan, everything included. Every feature below is live today.</p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl rounded-3xl border border-border bg-surface ring-card">
          <div className="divide-y divide-border">
            {INCLUDED.map((g) => (
              <section key={g.area} aria-label={g.area} className="px-5 py-5 sm:px-8">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground-secondary">{g.area}</h3>
                <ul className="mt-3 space-y-3">
                  {g.items.map((it) => (
                    <li key={it.text} className="flex gap-3 text-base text-foreground-secondary">
                      <Check className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden />
                      {it.text}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="flex flex-col items-center gap-3 border-t border-border p-6 sm:flex-row sm:justify-between">
            <p className="text-base text-muted">Prices rise by community size band. Slide the homes above for yours.</p>
            <Link href={SIGN_UP_URL} className="btn btn-primary">
              Start free trial
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-4xl rounded-3xl border border-dashed border-border-strong p-6">
          <h3 className="t-h3 text-foreground">Coming soon</h3>
          <p className="mt-1 text-base text-muted">Not available yet, so not in the table.</p>
          <ul className="mt-3 space-y-2">
            {comingSoon.map((r) => (
              <li key={r} className="flex gap-2.5 text-base text-muted">
                <Clock className="mt-1.5 h-4 w-4 shrink-0" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
