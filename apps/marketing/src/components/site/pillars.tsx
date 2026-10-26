import Link from 'next/link'
import { ArrowRight, BookOpen, Calendar, FileText, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Home "feature pillars": four jobs a volunteer board does, each backed by
// workflows that /hoa lists with their quality bar. Copy is lifted from the
// /hoa workflow cards and lib/workflows.ts descriptions, nothing new.

const PILLARS: {
  Icon: LucideIcon
  title: string
  body: string
  points: string[]
}[] = [
  {
    Icon: BookOpen,
    title: 'Know the rules',
    body: 'Ask in plain English. The answer cites the CC&R section or the statute, and says so when your documents don’t cover it.',
    points: ['Covenant Brain', 'State-law answers', 'Resident assistant on the portal'],
  },
  {
    Icon: FileText,
    title: 'Handle violations and requests',
    body: 'A photo and a caption become a drafted letter with the rule cited. It waits in Approvals; approving never emails the homeowner by itself.',
    points: ['Violation Drafter', 'AI ARC review', 'Shared inbox with reply drafts'],
  },
  {
    Icon: Calendar,
    title: 'Run meetings and tell residents',
    body: 'Paste the transcript for draft minutes. Type what you want to say and get an announcement with a phone preview. Nothing sends until you press Send.',
    points: ['AI meeting minutes', 'Message drafter', 'Spanish announcements, board-confirmed'],
  },
  {
    Icon: Wallet,
    title: 'Keep the books',
    body: 'Scan a vendor bill into Approvals and fix anything before you approve. On the 1st, the board gets a month-end report from the books.',
    points: ['Accounting and bank feeds', 'Bill scan', 'Month-end board report'],
  },
]

export function Pillars() {
  return (
    <section id="products" className="section scroll-mt-16 bg-surface">
      <div className="container-page">
        <header className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">Everything a board does, in one place</p>
            <h2 className="t-h2 mt-4 text-foreground">
              Four jobs.{' '}
              <span className="t-serif text-primary">One system.</span>
            </h2>
          </div>
          <p className="t-lead">
            Covenants, violations, meetings and money, with AI drafting the paperwork and a board member approving every
            word.
          </p>
        </header>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {PILLARS.map(({ Icon, title, body, points }) => (
            <article key={title} className="card card-hover flex flex-col p-7 md:p-9">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-[0_10px_20px_-10px_hsl(var(--primary)/0.7)]">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-7 text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
              <p className="mt-3 text-base leading-relaxed text-foreground-secondary">{body}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {points.map((p) => (
                  <li key={p} className="rounded-full bg-subtle px-3 py-1.5 text-[13px] font-medium text-foreground-secondary">
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
