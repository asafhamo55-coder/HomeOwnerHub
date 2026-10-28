import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CalendarClock, ClipboardCheck } from 'lucide-react'
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

const tools = GEORGIA_LINKS.filter((l) => l.kind === 'tool')

export default function GeorgiaHubPage() {
  return (
    <main id="main-content">
      <Nav />
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
              Get your HOA ready for SB 406{' '}
              <span className="t-serif text-primary">before January 1.</span>
            </h1>
            <p className="t-lead mt-6 max-w-2xl">
              Plain-language guides for volunteer boards, with the statute’s own words quoted so you can check them. Free
              checklists you can print. No sign-up.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/georgia/readiness" className="btn btn-primary btn-lg group">
                Take the 3-minute readiness check
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <TrackedLink href="/demo" event="demo_cta_click" position="georgia_hub_hero" className="btn btn-secondary btn-lg">
                Book a demo
              </TrackedLink>
            </div>
          </div>
        </div>
      </header>

      <section className="section border-t border-border">
        <div className="container-page">
          <div className="mx-auto max-w-4xl">
            <h2 className="t-h2 text-foreground">Two dates to know</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="card p-6">
                <CalendarClock className="h-5 w-5 text-primary" aria-hidden />
                <p className="mt-3 text-lg font-semibold text-foreground">July 1, 2026</p>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">
                  The attorney’s-fee notice rule applies to actions filed on or after this date.{' '}
                  <Link href="/georgia/attorney-fee-notice" className="font-semibold text-primary hover:underline">
                    Read the guide
                  </Link>
                  .
                </p>
              </div>
              <div className="card p-6">
                <CalendarClock className="h-5 w-5 text-primary" aria-hidden />
                <p className="mt-3 text-lg font-semibold text-foreground">January 1, 2027</p>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">
                  Registration, the new foreclosure rules, owners’ rights and the complaint process take effect.{' '}
                  <Link href="/georgia/registration-2027" className="font-semibold text-primary hover:underline">
                    Start with registration
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section border-t border-border bg-surface">
        <div className="container-page">
          <div className="mx-auto max-w-4xl">
            <h2 className="t-h2 text-foreground">The guides</h2>
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

      <section className="section border-t border-border">
        <div className="container-page">
          <div className="mx-auto max-w-4xl">
            <h2 className="t-h2 text-foreground">What HomeownerHub does for Georgia boards</h2>
            <p className="t-lead mt-4 max-w-2xl">
              Each item below is live in the app today. The board approves every draft.
            </p>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {GEORGIA_FEATURES.map((f) => (
                <li key={f.title} className="card p-6">
                  <p className="text-[16px] font-semibold text-foreground">{f.title}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{f.body}</p>
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted">{f.citation}</p>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <NotLegalAdvice />
              <p className="mt-4 text-sm leading-relaxed text-muted">{GEORGIA_SCOPE_NOTE}</p>
            </div>
          </div>
        </div>
      </section>

      <GeorgiaCta position="georgia_hub_end" />
      <Footer />
    </main>
  )
}
