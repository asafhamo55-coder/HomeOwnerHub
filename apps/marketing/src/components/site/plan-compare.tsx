import { Check, Clock, Minus } from 'lucide-react'
import { Fragment } from 'react'
import Link from 'next/link'
import { SIGN_UP_URL } from './brand'
import { bandMonthlyUsd, formatUsd } from '../../lib/hoa-pricing'

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


const ROW = 'px-3 py-4 sm:px-6'

export function PlanCompare({ comingSoon }: { comingSoon: string[] }) {
  const ess = formatUsd(bandMonthlyUsd('essentials', 1))
  const comp = formatUsd(bandMonthlyUsd('complete', 1))
  return (
    <section className="section scroll-mt-20" id="included" aria-labelledby="included-h">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Compare the plans</p>
          <h2 id="included-h" className="t-h2 mt-4 text-foreground">
            Everything your board can use today.
          </h2>
          <p className="t-lead mt-4">
            Essentials has the core. Complete adds the books and the mailbox. Every feature below is live today.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl rounded-3xl border border-border bg-surface ring-card">
          <table className="w-full border-separate border-spacing-0 text-left text-base">
            <caption className="sr-only">Which features are on Essentials and which on Complete</caption>
            <thead>
              <tr>
                {[
                  { k: 'f', t: 'Feature', s: '' },
                  { k: 'e', t: 'Essentials', s: `from ${ess}/mo` },
                  { k: 'c', t: 'Complete', s: `from ${comp}/mo` },
                ].map((h, i) => (
                  <th
                    key={h.k}
                    scope="col"
                    className={`sticky top-[4.5rem] z-10 border-b border-border bg-surface px-3 py-4 align-bottom sm:px-6 md:top-[6.05rem] ${i === 0 ? 'rounded-tl-3xl' : 'w-[6.5rem] text-center sm:w-44'} ${i === 2 ? 'rounded-tr-3xl' : ''}`}
                  >
                    <span className="block text-base font-semibold text-foreground sm:text-lg">{h.t}</span>
                    {h.s && <span className="block text-sm font-normal text-muted">{h.s}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INCLUDED.map((g) => (
                <Fragment key={g.area}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className="bg-subtle px-3 py-3 text-sm font-semibold uppercase tracking-wider text-foreground-secondary sm:px-6"
                    >
                      {g.area}
                    </th>
                  </tr>
                  {g.items.map((it) => (
                    <tr key={it.text}>
                      <th scope="row" className={`${ROW} border-b border-border text-base font-normal text-foreground-secondary`}>
                        {it.text}
                      </th>
                      <td className={`${ROW} border-b border-border text-center`}>
                        {it.complete ? (
                          <>
                            <Minus className="mx-auto h-5 w-5 text-muted" aria-hidden />
                            <span className="sr-only">Not on Essentials</span>
                          </>
                        ) : (
                          <>
                            <Check className="mx-auto h-6 w-6 text-success" aria-hidden />
                            <span className="sr-only">Included</span>
                          </>
                        )}
                      </td>
                      <td className={`${ROW} border-b border-border bg-primary-subtle/40 text-center`}>
                        <Check className="mx-auto h-6 w-6 text-success" aria-hidden />
                        <span className="sr-only">Included</span>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col items-center gap-3 p-6 sm:flex-row sm:justify-between">
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
