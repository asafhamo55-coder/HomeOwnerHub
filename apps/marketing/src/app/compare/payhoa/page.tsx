import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Clock, Minus, X, HelpCircle } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { HeroCtas } from '@/components/site/hero-ctas'
import { cn } from '@/lib/cn'
import { TRIAL_DAYS, bandMonthlyUsd, formatUsd } from '@/lib/hoa-pricing'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/compare/payhoa']!, path: '/compare/payhoa' })

// Competitor facts come from docs/decisions/2026-10-31-payhoa-gap-analysis.md
// (their public pages, seen 2026-10-31). Our side was checked against apps/hoa.
// Online card and ACH payments are not live, so they say "Coming soon".
const CHECKED = 'Oct 31, 2026'

type State = 'yes' | 'partial' | 'soon' | 'no' | 'unknown'
interface Side { state: State; note: string }
interface Row { area: string; payhoa: Side; hh: Side }

const BADGE: Record<State, { label: string; cls: string; Icon: typeof Check }> = {
  yes: { label: 'Yes', cls: 'bg-success-subtle text-success ring-success/20', Icon: Check },
  partial: { label: 'Partial', cls: 'bg-warning-subtle text-foreground ring-warning/30', Icon: Minus },
  soon: { label: 'Coming soon', cls: 'bg-primary-subtle text-primary ring-primary/25', Icon: Clock },
  no: { label: 'No', cls: 'bg-subtle text-foreground ring-border', Icon: X },
  unknown: { label: 'Not listed', cls: 'bg-subtle text-foreground-secondary ring-border', Icon: HelpCircle },
}

const LEADS: Row[] = [
  {
    area: 'Georgia law built in',
    payhoa: { state: 'partial', note: 'State-law guides on their blog.' },
    hh: { state: 'yes', note: 'Georgia registration kit and SB 406 deadline clocks inside the product. Florida, California and Texas rules too.' },
  },
  {
    area: 'Architectural review',
    payhoa: { state: 'partial', note: 'A request form.' },
    hh: { state: 'yes', note: 'Decide-by deadline, decision letters and an AI precheck against your guidelines.' },
  },
  {
    area: 'Collections ladder',
    payhoa: { state: 'unknown', note: 'Not listed on their public pages.' },
    hh: { state: 'yes', note: 'Every step with the legal clocks and certified-mail tracking.' },
  },
  {
    area: 'Violation hearings and fines',
    payhoa: { state: 'yes', note: 'Violation tracking. Hearings are not described on their public pages.' },
    hh: { state: 'yes', note: 'Hearings, fines, AI-drafted letters and a path for the owner to fix the issue.' },
  },
  {
    area: 'AI grounded in your documents',
    payhoa: { state: 'yes', note: 'Gable, a paid add-on that is on by default. $24.50 a month after 3 free months.' },
    hh: { state: 'yes', note: 'Answers cite your CC&R section. Violation and ARC analysis and inbox drafts. Included in both plans.' },
  },
  {
    area: 'Accounting depth',
    payhoa: { state: 'yes', note: 'General ledger, bank sync, reconciliation and budgets. 1099 e-file and bookkeeping are paid add-ons.' },
    hh: { state: 'yes', note: 'General ledger, reconciliation and budgets, plus period close, CPA export and a year-end packet. 1099s: candidate list only.' },
  },
]

const PARITY: Row[] = [
  {
    area: 'Online dues by card or ACH',
    payhoa: { state: 'yes', note: 'A core feature.' },
    hh: { state: 'soon', note: 'Coming soon. Today: Zelle with auto-match, and recorded checks.' },
  },
  {
    area: 'Autopay',
    payhoa: { state: 'yes', note: 'Opt-in, with a cap.' },
    hh: { state: 'soon', note: 'Coming soon.' },
  },
  {
    area: 'Late fees and payment plans',
    payhoa: { state: 'yes', note: '' },
    hh: { state: 'yes', note: 'With state caps.' },
  },
  {
    area: 'Email to owners',
    payhoa: { state: 'yes', note: '' },
    hh: { state: 'yes', note: '' },
  },
  {
    area: 'Text messages',
    payhoa: { state: 'yes', note: 'Unlimited.' },
    hh: { state: 'soon', note: 'Built, waiting on a messaging provider account.' },
  },
  {
    area: 'Mailed letters',
    payhoa: { state: 'yes', note: 'They print and mail for $1.05 to $1.25.' },
    hh: { state: 'partial', note: 'Printable letters with tracking. We do not print and mail yet.' },
  },
  {
    area: 'Documents and resident portal',
    payhoa: { state: 'yes', note: '' },
    hh: { state: 'yes', note: 'Installable web app with push alerts.' },
  },
  {
    area: 'Work orders and tickets',
    payhoa: { state: 'unknown', note: 'Not visible on their public pages.' },
    hh: { state: 'yes', note: '' },
  },
  {
    area: 'Voting and surveys',
    payhoa: { state: 'yes', note: '' },
    hh: { state: 'partial', note: 'Paper election kit. No online surveys.' },
  },
  {
    area: 'Community website, amenity reservations, message boards',
    payhoa: { state: 'yes', note: '' },
    hh: { state: 'no', note: 'Not offered.' },
  },
  {
    area: 'Bill pay and mailed checks',
    payhoa: { state: 'yes', note: '$2 per check.' },
    hh: { state: 'no', note: 'Not offered.' },
  },
  {
    area: 'Support',
    payhoa: { state: 'yes', note: 'Phone, chat and screenshare, Monday to Friday 9 to 5 Eastern.' },
    hh: { state: 'partial', note: 'Email and in-app help.' },
  },
]

function Badge({ state }: { state: State }) {
  const { label, cls, Icon } = BADGE[state]
  return (
    <span className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-base font-semibold ring-1', cls)}>
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </span>
  )
}

function SideCell({ side, hh }: { side: Side; hh?: boolean }) {
  return (
    <div className={cn('px-5 py-5', hh && 'bg-primary-subtle/40')}>
      <Badge state={side.state} />
      {side.note && <p className="mt-2 text-[18px] leading-snug text-foreground-secondary">{side.note}</p>}
    </div>
  )
}

function ParityTable({ title, id, rows }: { title: string; id: string; rows: Row[] }) {
  return (
    <div className="card overflow-hidden" role="table" aria-labelledby={id}>
      <h2 id={id} className="sr-only">{title}</h2>
      <div role="row" className="hidden grid-cols-[1.1fr,1.5fr,1.5fr] border-b border-border bg-subtle/40 md:grid">
        <div role="columnheader" className="px-5 py-4 text-base font-semibold uppercase tracking-wider text-muted">Area</div>
        <div role="columnheader" className="px-5 py-4 text-lg font-semibold text-foreground">PayHOA</div>
        <div role="columnheader" className="bg-primary-subtle/60 px-5 py-4 text-lg font-semibold text-primary">HomeownerHub</div>
      </div>
      {rows.map((r) => (
        <div key={r.area} role="row" className="grid border-t border-border first:border-t-0 md:grid-cols-[1.1fr,1.5fr,1.5fr]">
          <div role="rowheader" className="px-5 pb-1 pt-5 text-[18px] font-semibold leading-snug text-foreground md:py-5">{r.area}</div>
          <div role="cell">
            <p className="px-5 pt-2 text-base font-semibold text-muted md:hidden">PayHOA</p>
            <SideCell side={r.payhoa} />
          </div>
          <div role="cell">
            <p className="bg-primary-subtle/40 px-5 pt-2 text-base font-semibold text-primary md:hidden">HomeownerHub</p>
            <SideCell side={r.hh} hh />
          </div>
        </div>
      ))}
    </div>
  )
}

const PRICE_ROWS: { size: string; payhoa: string; doors: number }[] = [
  { size: 'Up to 25 units', payhoa: '$49 a month', doors: 25 },
  { size: '26 to 50 units', payhoa: '$59 a month', doors: 50 },
  { size: '401 to 500 units', payhoa: '$249 a month', doors: 500 },
]

const STEPS = [
  { title: 'Start the trial', body: `${TRIAL_DAYS} days free, no credit card. Create your HOA in a few minutes.` },
  { title: 'Export your owner list', body: 'Download your roster from PayHOA as a spreadsheet, or use the one your board already keeps.' },
  { title: 'Import it', body: 'Upload a CSV or Excel file. You see a preview of every row before anything is saved.' },
  { title: 'Invite your board', body: 'Add the other board members and decide what you want to move over first.' },
]

export default function ComparePayhoaPage() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <PageHero
          eyebrow="HomeownerHub vs PayHOA"
          title={
            <>
              A fair look at <span className="t-serif text-primary">PayHOA and HomeownerHub.</span>
            </>
          }
          subtitle={`PayHOA is established software for self-managed HOAs, and it is ahead of us on online payments today. Here is where each of us is stronger. Their facts were checked on ${CHECKED} against their public pages.`}
        />

        <section className="pb-6 pt-2">
          <div className="container-page">
            <div className="mx-auto max-w-5xl">
              <h2 className="t-h2 text-foreground">Where HomeownerHub leads</h2>
              <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-foreground-secondary">
                The work a volunteer board dreads most: state law, architectural requests, collections and violations.
              </p>
              <div className="mt-6">
                <ParityTable id="leads-heading" title="Where HomeownerHub leads" rows={LEADS} />
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container-page">
            <div className="mx-auto max-w-5xl">
              <h2 className="t-h2 text-foreground">Where PayHOA is ahead or equal</h2>
              <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-foreground-secondary">
                Online card and ACH payments are not live in HomeownerHub yet. If collecting dues online is the first thing your board needs, PayHOA does that today.
              </p>
              <div className="mt-6">
                <ParityTable id="parity-heading" title="Feature parity" rows={PARITY} />
              </div>
              <p className="mt-4 text-base text-muted">
                Yes means the feature is live. Partial means part of it is. Coming soon means it is not live yet. Not listed means we did not find it on their public pages. Checked {CHECKED}.
              </p>
            </div>
          </div>
        </section>

        <section className="section section-warm">
          <div className="container-page">
            <div className="mx-auto max-w-5xl">
              <h2 className="t-h2 text-foreground">Prices, as of {CHECKED}</h2>
              <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-foreground-secondary">
                PayHOA has one plan with every feature, priced by unit count. HomeownerHub has two plans priced by size band: Essentials, and Complete, which adds accounting, the mailbox, vendors and leases. AI is in both.
              </p>
              <div className="card mt-6 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-[18px]">
                  <caption className="sr-only">Monthly price by community size, PayHOA and HomeownerHub</caption>
                  <thead>
                    <tr className="border-b border-border bg-subtle/40">
                      <th scope="col" className="px-5 py-4 font-semibold">Community size</th>
                      <th scope="col" className="px-5 py-4 font-semibold">PayHOA</th>
                      <th scope="col" className="px-5 py-4 font-semibold">HomeownerHub Essentials</th>
                      <th scope="col" className="bg-primary-subtle/60 px-5 py-4 font-semibold text-primary">HomeownerHub Complete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRICE_ROWS.map((p) => (
                      <tr key={p.size} className="border-t border-border">
                        <th scope="row" className="px-5 py-4 font-semibold">{p.size}</th>
                        <td className="px-5 py-4">{p.payhoa}</td>
                        <td className="px-5 py-4">{formatUsd(bandMonthlyUsd('essentials', p.doors))} a month</td>
                        <td className="bg-primary-subtle/40 px-5 py-4">{formatUsd(bandMonthlyUsd('complete', p.doors))} a month</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-6 max-w-3xl list-disc space-y-2 pl-6 text-[18px] leading-relaxed text-foreground-secondary">
                <li>HomeownerHub prices are at the top of each row's size. See the <Link href="/pricing" className="font-medium text-primary underline underline-offset-4">pricing page</Link> for every band.</li>
                <li>PayHOA card payments cost 3.5% plus $0.50 and ACH costs $2.45, and either can be passed to the owner. HomeownerHub online payments are coming soon, so we have no fee to show yet.</li>
                <li>PayHOA lists 1099s, tax filing and bookkeeping as paid add-ons, mailed letters at $1.05 to $1.25, and Gable AI at $24.50 a month after 3 free months.</li>
                <li>Both start with a {TRIAL_DAYS}-day trial and no card.</li>
                <li>Prices change. Check payhoa.com for theirs. Ours come from the same numbers checkout uses.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container-page">
            <div className="mx-auto max-w-5xl">
              <h2 className="t-h2 text-foreground">Switching is easy</h2>
              <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-foreground-secondary">
                You do not have to commit to try it. Run the {TRIAL_DAYS}-day trial next to your current setup and see your own owner list in it.
              </p>
              <ol className="mt-8 grid gap-5 md:grid-cols-2">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="card flex gap-4 p-6">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-lg font-semibold text-primary" aria-hidden>{i + 1}</span>
                    <div>
                      <h3 className="t-h3 text-foreground">{s.title}</h3>
                      <p className="mt-2 text-[18px] leading-relaxed text-foreground-secondary">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 max-w-3xl text-[18px] leading-relaxed text-foreground-secondary">
                Import is self-serve and free. We have no onboarding specialists today, so the setup checklist walks you through it.
              </p>
            </div>
          </div>
        </section>

        <section className="section section-ink">
          <div className="container-page text-center">
            <p className="eyebrow">Next step</p>
            <h2 className="t-h2 mx-auto mt-4 max-w-2xl text-foreground">See it with your own owner list.</h2>
            <div className="flex flex-col items-center">
              <HeroCtas position="closing" checks={false} secondaryLabel="Book a demo" />
            </div>
            <p className="mt-6 text-base text-muted">
              Not sure yet? Read the <Link href="/compare" className="font-medium text-primary underline underline-offset-4">wider comparison</Link>.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
