import Link from 'next/link'
import { ArrowRight, CalendarClock, ClipboardList, Landmark, Mail, Percent, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { GEORGIA_FEATURES, GEORGIA_SCOPE_NOTE, STATE_COVERAGE } from '@/lib/state-law'

// BL-157: Georgia is the launch state, so the home page and /hoa lead with
// what the app does for Georgia law, then Florida, California and Texas.
// Every card comes from lib/state-law.ts, which marketing-truth.test.ts
// checks against apps/hoa routes.

const ICONS: Record<string, LucideIcon> = {
  '/compliance/ga-registration': Landmark,
  '/properties/[id]/collections-letter': Mail,
  '/meetings/[id]/quorum/proxies': Users,
  '/meetings/[id]/annual-report': ClipboardList,
  '/settings/late-fees': Percent,
  '/compliance': CalendarClock,
}

export function GeorgiaFirst({
  id = 'georgia',
  moreHref,
}: {
  id?: string
  /** Optional "see everything" link under the cards. */
  moreHref?: { label: string; href: string }
}) {
  const others = STATE_COVERAGE.filter((s) => s.state !== 'GA')
  return (
    <section className="section scroll-mt-16 bg-surface" id={id}>
      <div className="container-page">
        <header className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">Georgia first</p>
            <h2 className="t-h2 mt-4 text-foreground">
              The Georgia paperwork your board has to{' '}
              <span className="t-serif text-primary">get right.</span>
            </h2>
          </div>
          <p className="t-lead">
            Georgia’s 2026 HOA law (SB 406) adds registration with the Secretary of State and a notice before an
            association can claim attorney’s fees. HomeownerHub prepares that paperwork and the rest of Georgia’s from
            your records, shows the statute it follows, and waits for the board.
          </p>
        </header>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GEORGIA_FEATURES.map((f, i) => {
            const Icon = ICONS[f.route] ?? Landmark
            return (
              <li key={f.title} className="card card-hover group flex flex-col p-6 md:p-7">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-subtle text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-border-strong" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="t-h3 mt-6 text-foreground">{f.title}</h3>
                <p className="mt-2.5 flex-1 text-[15px] leading-relaxed text-foreground-secondary">{f.body}</p>
                <p className="mt-5 border-t border-border pt-4 text-xs font-medium text-muted">{f.citation}</p>
              </li>
            )
          })}
        </ul>

        <div className="mt-6 rounded-[1.25rem] border border-border bg-subtle/60 p-6 md:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="t-h3 text-foreground">Then Florida, California and Texas</h3>
          </div>
          <dl className="mt-6 grid gap-6 sm:grid-cols-3">
            {others.map((s) => (
              <div key={s.state}>
                <dt className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-foreground px-1.5 text-[11px] font-bold text-background">
                    {s.state}
                  </span>
                  {s.name}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-foreground-secondary">{s.items.join(' · ')}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted">
            {GEORGIA_SCOPE_NOTE} Dues, violations, documents, accounting, the inbox and announcements work for an HOA in
            any state.
          </p>
        </div>

        {moreHref ? (
          <Link
            href={moreHref.href}
            className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline"
          >
            {moreHref.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  )
}
