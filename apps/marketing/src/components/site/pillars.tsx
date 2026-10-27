import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  FileText,
  Megaphone,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Home "what the workspace does": eight pillars, each backed by something
// shipped in apps/hoa (see lib/features.ts, lib/workflows.ts and the
// /hoa workflow cards, which carry the quality bars). Copy is lifted from
// those lists; nothing new is claimed here.

const PILLARS: {
  Icon: LucideIcon
  title: string
  body: string
  points: string[]
}[] = [
  {
    Icon: ShieldCheck,
    title: 'AI drafting, board approval',
    body: 'Letters, notices, minutes and bills are drafted from your records and wait in Approvals. Approving never emails a homeowner by itself.',
    points: ['Approvals queue', 'Violation Drafter', 'AI meeting minutes'],
  },
  {
    Icon: Wallet,
    title: 'Dues and collections',
    body: 'Balances by home, a late-fee policy the board sets and collections letters drafted for the board to review.',
    points: ['Collections letters', 'Late-fee policy', 'Resident balances'],
  },
  {
    Icon: FileText,
    title: 'Violations and requests',
    body: 'A photo and a caption become a drafted letter with the rule cited. Residents can pre-check an architectural request against your guidelines.',
    points: ['Violation Drafter', 'AI ARC review', 'Create from email'],
  },
  {
    Icon: Megaphone,
    title: 'Communications and announcements',
    body: 'Type what you want to say and get an announcement with a phone preview. See who opened it. A shared inbox drafts replies beside the home’s details.',
    points: ['Message drafter', 'Spanish, board-confirmed', 'Shared inbox'],
  },
  {
    Icon: Receipt,
    title: 'Accounting and bank import',
    body: 'General ledger, bank feeds and reconciliation. Scan a vendor bill into Approvals, and on the 1st the board gets a month-end report.',
    points: ['Bank feeds', 'Bill scan', 'Month-end board report'],
  },
  {
    Icon: BookOpen,
    title: 'Documents and Ask-the-docs',
    body: 'Upload your CC&R and bylaws, then ask in plain English. The answer cites the section, and says so when your documents don’t cover it.',
    points: ['Covenant Brain', 'Cited answers', 'Board Copilot'],
  },
  {
    Icon: Users,
    title: 'The resident portal',
    body: 'Residents see their balance, file architectural and maintenance requests, and ask the governing documents before they email the board.',
    points: ['Balance and statement', 'Requests', 'Resident assistant'],
  },
  {
    Icon: CalendarClock,
    title: 'Compliance and deadlines',
    body: 'One page for registration, meeting-notice and records deadlines, with an overdue banner, plus an election planner and an annual meeting kit.',
    points: ['Compliance page', 'Election planner', 'Annual meeting kit'],
  },
]

export function Pillars() {
  return (
    <section id="products" className="section scroll-mt-16 bg-surface">
      <div className="container-page">
        <header className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">What the workspace does</p>
            <h2 className="t-h2 mt-4 text-foreground">
              Everything a board does,{' '}
              <span className="t-serif text-primary">in one place.</span>
            </h2>
          </div>
          <p className="t-lead">
            Dues, violations, communications, money, documents and residents, with AI drafting the paperwork and a
            board member approving every word.
          </p>
        </header>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ Icon, title, body, points }) => (
            <article key={title} className="card card-hover flex flex-col p-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-[0_10px_20px_-10px_hsl(var(--primary)/0.7)]">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="t-h3 mt-6 text-foreground">{title}</h3>
              <p className="mt-2.5 flex-1 text-[15px] leading-relaxed text-foreground-secondary">{body}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {points.map((p) => (
                  <li key={p} className="rounded-full bg-subtle px-3 py-1 text-xs font-medium text-foreground-secondary">
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/hoa" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline">
            See every workflow and its quality bar
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
