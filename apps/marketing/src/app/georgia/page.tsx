import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CalendarClock, ClipboardCheck, FileText, Gavel, Scale, ShieldCheck, Users } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { Breadcrumbs, GeorgiaCta, NotLegalAdvice } from '@/components/georgia/parts'
import { TrackedLink } from '@/components/site/tracked-link'
import { GEORGIA_FEATURES, GEORGIA_SCOPE_NOTE } from '@/lib/state-law'
import { GENERAL_LINKS, GEORGIA_LINKS, GUIDE_LIST } from '@/lib/georgia'
import { SITE_ORIGIN, pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { breadcrumbLd } from '@/lib/jsonld'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/georgia']!, path: '/georgia' })

const FEATURE_ICONS = [ShieldCheck, Gavel, Users, FileText, Scale, CalendarClock]

const CHANGES = [
  {
    stat: '$100',
    title: 'Register with the Secretary of State, or opt out in writing',
    body: 'An unregistered association may not collect fines or fees, file liens or start foreclosure. Renewal is every December 31.',
    href: '/georgia/registration-2027',
  },
  {
    stat: '60 days',
    title: 'New foreclosure rules',
    body: 'Notice grows from 30 to 60 days and the lien lasts six years. The threshold becomes the lesser of $4,000 or 12 months of assessments, never under $2,000.',
    href: '/georgia/foreclosure-threshold-2027',
  },
  {
    stat: '12 rights',
    title: 'Owners’ rights in writing',
    body: 'Owners can demand three years of accounting records and the insurance certificate. Boards need a repeatable way to answer.',
    href: '/georgia/owners-rights-2027',
  },
  {
    stat: '180 days',
    title: 'A complaint process at the state',
    body: 'An owner can file a complaint with the Secretary of State, and filing pauses collection of the fines or fees involved.',
    href: '/georgia/complaint-process',
  },
]

const TIMELINE = [
  {
    date: 'July 1, 2026',
    title: 'Attorney’s-fee notice rule applies',
    body: 'Before fees can be collected, send written notice by certified mail or statutory overnight delivery. The owner then has 30 days from receipt.',
    href: '/georgia/attorney-fee-notice',
    cta: 'Read the guide.',
  },
  {
    date: 'January 1, 2027',
    title: 'Most of SB 406 takes effect',
    body: 'Registration, the new foreclosure rules, owners’ rights and the complaint process all start.',
    href: '/georgia/registration-2027',
    cta: 'Start with registration.',
  },
  {
    date: 'Within 30 days of a change',
    title: 'File an amended statement',
    body: 'New officers, or a new name or address, mean an amended registration statement.',
    href: '/georgia/registration-2027',
    cta: 'See what to file.',
  },
  {
    date: 'Every December 31',
    title: 'Renew your registration',
    body: 'Registration expires each year on this date. Put it on the board calendar now.',
    href: "/georgia/registration-2027",
    cta: "Renewal rules.",
  },
]

const tools = GEORGIA_LINKS.filter((l) => l.kind === 'tool')

export default function GeorgiaHubPage() {
  return (
    <>
      <Nav />
    <main id="main-content">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Georgia', path: '/georgia' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Georgia HOA guides and free tools',
            itemListElement: GEORGIA_LINKS.map((l, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: l.title,
              url: `${SITE_ORIGIN}${l.path}`,
            })),
          },
        ]}
      />

      <header className="hero-wash relative overflow-hidden pb-14 pt-28 md:pb-20 md:pt-36">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Georgia' }]} />
            <p className="eyebrow mt-6">Georgia · SB 406</p>
            <h1 className="t-display mt-4 text-foreground">
              Georgia HOA law, <span className="t-serif text-primary">built into your daily work.</span>
            </h1>
            <p className="t-lead mt-6 max-w-2xl">
              Most of SB 406 starts January 1, 2027. HomeownerHub puts the registration kit, the notice rules and the
              deadlines in the same workspace where your board already runs dues, meetings and letters. Free guides and
              printable checklists too, with the statute quoted so you can check it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href="/demo" event="pilot_cta_click" position="georgia_hub_hero" className="btn btn-primary btn-lg group">
                Start free trial
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </TrackedLink>
              <Link href="/georgia/readiness" className="btn btn-secondary btn-lg">
                Take the 3-minute readiness check
              </Link>
            </div>
            <p className="mt-5 text-base text-foreground-secondary">30-day free trial · No card needed · Not legal advice</p>
          </div>
        </div>
      </header>

      <section className="section border-t border-border">
        <div className="container-page">
          <div className="mx-auto max-w-5xl">
            <p className="eyebrow">What changes</p>
            <h2 className="t-h2 mt-3 text-foreground">What changes on January 1, 2027</h2>
            <p className="t-lead mt-4 max-w-2xl">
              SB 406 is the Georgia Property Owners’ Bill of Rights Act. Four changes reach nearly every volunteer board.
            </p>
            <ul className="mt-10 grid gap-5 md:grid-cols-2">
              {CHANGES.map((c) => (
                <li key={c.title}>
                  <Link href={c.href} className="card group flex h-full flex-col p-7 transition-shadow hover:shadow-md">
                    <span className="text-3xl font-bold tracking-tight text-primary">{c.stat}</span>
                    <span className="mt-3 text-xl font-semibold leading-snug text-foreground group-hover:text-primary">{c.title}</span>
                    <span className="mt-3 text-lg leading-relaxed text-foreground-secondary">{c.body}</span>
                    <span className="mt-5 inline-flex min-h-11 items-center gap-1 text-base font-semibold text-primary">
                      Read the guide <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section border-t border-border bg-surface">
        <div className="container-page">
          <div className="mx-auto max-w-5xl">
            <p className="eyebrow">What HomeownerHub does for you</p>
            <h2 className="t-h2 mt-3 text-foreground">Live in the app today</h2>
            <p className="t-lead mt-4 max-w-2xl">The board approves every draft. Nothing is sent or filed on its own.</p>
            <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {GEORGIA_FEATURES.map((f, i) => {
                const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length]!
                return (
                  <li key={f.title} className="card flex flex-col p-7">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-subtle text-primary">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <p className="mt-5 text-xl font-semibold leading-snug text-foreground">{f.title}</p>
                    <p className="mt-3 text-lg leading-relaxed text-foreground-secondary">{f.body}</p>
                    <p className="mt-auto pt-4 font-mono text-xs uppercase tracking-wider text-muted">{f.citation}</p>
                  </li>
                )
              })}
            </ul>
            <div className="mt-10">
              <NotLegalAdvice />
              <p className="mt-4 text-base leading-relaxed text-muted">{GEORGIA_SCOPE_NOTE}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section border-t border-border">
        <div className="container-page">
          <div className="mx-auto max-w-4xl">
            <p className="eyebrow">Deadlines</p>
            <h2 className="t-h2 mt-3 text-foreground">The dates your board works to</h2>
            <ol className="relative mt-10 border-l-2 border-border pl-8">
              {TIMELINE.map((t) => (
                <li key={t.date} className="relative pb-10 last:pb-0">
                  <span className="absolute -left-[2.6rem] top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary ring-4 ring-[hsl(var(--background))]" aria-hidden />
                  <p className="text-sm font-semibold uppercase tracking-wider text-primary">{t.date}</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{t.title}</p>
                  <p className="mt-2 max-w-2xl text-lg leading-relaxed text-foreground-secondary">
                    {t.body}{' '}
                    <Link href={t.href} className="font-semibold text-primary hover:underline">
                      {t.cta}
                    </Link>
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-base text-muted">
              The Compliance page in the app tracks these for your association and shows an overdue banner.
            </p>
          </div>
        </div>
      </section>

      <section className="section border-t border-border bg-surface">
        <div className="container-page">
          <div className="mx-auto max-w-4xl">
            <h2 className="t-h2 text-foreground">The Georgia guides</h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {GUIDE_LIST.map((g) => (
                <li key={g.slug}>
                  <Link href={`/georgia/${g.slug}`} className="card group flex h-full flex-col p-6 transition-shadow hover:shadow-md">
                    <span className="eyebrow">{g.eyebrow}</span>
                    <span className="mt-3 text-[18px] font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">
                      {g.title}
                    </span>
                    <span className="mt-3 text-[15px] leading-relaxed text-foreground-secondary">{g.summary[0]}</span>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      Read the guide <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section border-t border-border">
        <div className="container-page">
          <div className="mx-auto max-w-4xl">
            <h2 className="t-h2 text-foreground">Free tools, no sign-up</h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {tools.map((t) => (
                <li key={t.slug}>
                  <Link href={t.path} className="card group flex h-full flex-col p-6 transition-shadow hover:shadow-md">
                    <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden />
                    <span className="mt-3 text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary">{t.title}</span>
                    <span className="mt-2 text-sm leading-relaxed text-foreground-secondary">{t.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section border-t border-border bg-surface">
        <div className="container-page">
          <div className="mx-auto max-w-4xl">
            <h2 className="t-h2 text-foreground">Running the board day to day</h2>
            <p className="t-lead mt-4 max-w-2xl">
              Not specific to SB 406, and useful in any state. Also see the{' '}
              <Link href="/georgia/self-managed-hoa-georgia-first-90-days" className="font-semibold text-primary hover:underline">
                first 90 days as a self-managed board
              </Link>
              .
            </p>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {GENERAL_LINKS.map((t) => (
                <li key={t.slug}>
                  <Link href={t.path} className="card group flex h-full flex-col p-6 transition-shadow hover:shadow-md">
                    <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden />
                    <span className="mt-3 text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary">{t.title}</span>
                    <span className="mt-2 text-sm leading-relaxed text-foreground-secondary">{t.blurb}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/professionals" className="card group flex h-full flex-col p-6 transition-shadow hover:shadow-md">
                  <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden />
                  <span className="mt-3 text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary">For attorneys and CPAs</span>
                  <span className="mt-2 text-sm leading-relaxed text-foreground-secondary">Boards can invite you with limited, time-boxed access, and send you reports.</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <GeorgiaCta position="georgia_hub_end" />
      </main>
    <Footer />
    </>
  )
}
