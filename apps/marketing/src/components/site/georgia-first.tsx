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
    <section className="border-y border-border/60 bg-subtle/30 py-20 md:py-28" id={id}>
      <div className="container-page">
        <header className="max-w-3xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Georgia first
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] text-foreground md:text-[44px] md:leading-[1.08]">
            The Georgia paperwork your board has to get right.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
            Georgia’s 2026 HOA law (SB 406) adds registration with the
            Secretary of State and a notice before an association can claim
            attorney’s fees. HomeownerHub prepares that paperwork and the rest
            of Georgia’s from your records, shows the statute it follows, and
            waits for the board.
          </p>
        </header>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GEORGIA_FEATURES.map((f) => {
            const Icon = ICONS[f.route] ?? Landmark
            return (
              <li key={f.title} className="flex flex-col rounded-2xl border border-border/70 bg-surface p-6 ring-card">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{f.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-foreground-secondary">{f.body}</p>
                <p className="mt-4 font-mono text-[11px] text-muted">{f.citation}</p>
              </li>
            )
          })}
        </ul>

        <div className="mt-10 rounded-2xl border border-border/70 bg-surface p-6 ring-card md:p-8">
          <p className="text-sm font-semibold text-foreground">Then Florida, California and Texas</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            {others.map((s) => (
              <div key={s.state}>
                <dt className="text-sm font-semibold text-foreground">{s.name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-foreground-secondary">{s.items.join(' · ')}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted">
            {GEORGIA_SCOPE_NOTE} Dues, violations, documents, accounting, the
            inbox and announcements work for an HOA in any state.
          </p>
        </div>

        {moreHref ? (
          <Link
            href={moreHref.href}
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            {moreHref.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  )
}
