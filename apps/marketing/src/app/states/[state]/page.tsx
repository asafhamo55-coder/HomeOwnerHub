import * as React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { TrackedLink } from '@/components/site/tracked-link'
import { ApprovalsScreen, DuesScreen, ViolationsScreen } from '@/components/site/tour-screens'
import { Breadcrumbs, NotLegalAdvice } from '@/components/georgia/parts'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { breadcrumbLd } from '@/lib/jsonld'
import { STATE_GUIDE_LINKS, STATE_HUBS, STATE_HUB_SLUGS, STATE_LAW_ANSWERS_NOTE, type TourScreenKey } from '@/lib/state-law'

// One hub per non-Georgia state (Florida, California, Texas). Everything
// shown comes from STATE_HUBS, STATE_COVERAGE and STATE_GUIDE_LINKS in
// lib/state-law.ts; marketing-truth.test.ts checks the features against
// STATE_COVERAGE. Georgia keeps its own /georgia hub.

export const dynamicParams = false

export function generateStaticParams() {
  return STATE_HUB_SLUGS.map((state) => ({ state }))
}

const hubFor = (slug: string) => STATE_HUBS.find((h) => h.slug === slug)

export async function generateMetadata({ params }: { params: Promise<{ state: string }> }): Promise<Metadata> {
  const { state } = await params
  if (!hubFor(state)) return {}
  const path = `/states/${state}`
  return pageMetadata({ ...PAGE_META[path]!, path })
}

const SCREENS: Record<TourScreenKey, () => React.JSX.Element> = {
  approvals: () => <ApprovalsScreen />,
  dues: () => <DuesScreen />,
  violations: () => <ViolationsScreen />,
}

export default async function StateHubPage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params
  const hub = hubFor(state)
  if (!hub) notFound()
  const guides = STATE_GUIDE_LINKS[hub.state] ?? []

  return (
    <>
      <Nav />
      <main id="main-content">
        <JsonLd
          data={breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'State laws', path: '/states' },
            { name: hub.name, path: `/states/${hub.slug}` },
          ])}
        />

        <header className="hero-wash relative overflow-hidden pb-14 pt-28 md:pb-20 md:pt-36">
          <div className="container-page">
            <div className="mx-auto max-w-3xl">
              <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'State laws', href: '/states' }, { name: hub.name }]} />
              <p className="eyebrow mt-6">{hub.name} HOA law</p>
              <h1 className="t-display mt-4 text-foreground">
                {hub.name} rules, <span className="t-serif text-primary">built into the workspace.</span>
              </h1>
              <p className="t-lead mt-6 max-w-2xl">{hub.lead}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {hub.statutes.map((s) => (
                  <li key={s} className="rounded-full bg-subtle px-3 py-1.5 text-sm font-medium text-foreground-secondary">
                    {s}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <TrackedLink href="/demo" event="demo_cta_click" position={`state_hub_${hub.slug}_hero`} className="btn btn-primary btn-lg">
                  Book a demo
                </TrackedLink>
              </div>
            </div>
          </div>
        </header>

        <section className="section border-t border-border">
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <h2 className="t-h2 text-foreground">What the workspace does for {hub.name} boards</h2>
              <p className="t-lead mt-4 max-w-2xl">Each item is live in the app today. The board approves every draft.</p>
              <ul className="mt-8 grid gap-4 md:grid-cols-2">
                {hub.features.map((f) => (
                  <li key={f.item} className="card p-6">
                    <p className="text-[16px] font-semibold text-foreground">{f.item}</p>
                    <p className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{f.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="state-tour-h" className="section border-t border-border bg-surface">
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <h2 id="state-tour-h" className="t-h2 text-foreground">What it looks like</h2>
              <ul className="mt-8 grid gap-5 md:grid-cols-2">
                {hub.tour.map((t) => (
                  <li key={t.title} className="min-w-0">
                    <Link href="/#product-tour" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                      <div aria-hidden className="pointer-events-none h-[190px] w-full overflow-hidden rounded-xl border border-border/70 bg-subtle/60">
                        <div className="w-[640px] origin-top-left scale-50">{SCREENS[t.screen]()}</div>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground group-hover:text-primary">{t.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">{t.caption}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {guides.length > 0 && (
          <section className="section border-t border-border">
            <div className="container-page">
              <div className="mx-auto max-w-4xl">
                <h2 className="t-h2 text-foreground">Guides for {hub.name} boards</h2>
                <ul className="mt-6 space-y-3">
                  {guides.map((g) => (
                    <li key={g.href}>
                      <Link href={g.href} className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-primary hover:underline">
                        {g.label}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <section className="section border-t border-border bg-surface">
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <h2 className="t-h3 text-foreground">What to know</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
                {hub.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-muted">{STATE_LAW_ANSWERS_NOTE}</p>
              <div className="mt-6">
                <NotLegalAdvice />
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <TrackedLink href="/demo" event="demo_cta_click" position={`state_hub_${hub.slug}_end`} className="btn btn-primary btn-lg">
                  Book a demo
                </TrackedLink>
                <Link href="/states" className="btn btn-secondary btn-lg">
                  All state laws
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
