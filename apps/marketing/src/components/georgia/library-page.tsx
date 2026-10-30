import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, ClipboardCheck } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { TrackedLink } from '@/components/site/tracked-link'
import { Breadcrumbs, GeorgiaCta, NotLegalAdvice } from '@/components/georgia/parts'
import { breadcrumbLd } from '@/lib/jsonld'
import { SITE_ORIGIN } from '@/lib/site'
import type { LibraryItem } from '@/lib/library'

export interface LibrarySection {
  id: string
  label: string
  blurb?: string
  items: LibraryItem[]
}

/** Shared shell for the /guides and /templates index pages: anchor chips, one section per group, demo CTA. No client JS. */
export function LibraryPage({
  name,
  path,
  eyebrow,
  title,
  lead,
  sections,
  linkLabel,
  position,
}: {
  name: string
  path: string
  eyebrow: string
  title: string
  lead: string
  sections: LibrarySection[]
  linkLabel: string
  position: string
}) {
  const Icon = path === '/guides' ? BookOpen : ClipboardCheck
  const all = sections.flatMap((s) => s.items)
  return (
    <>
      <Nav />
      <main id="main-content">
        <JsonLd
          data={[
            breadcrumbLd([
              { name: 'Home', path: '/' },
              { name, path },
            ]),
            {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: title,
              itemListElement: all.map((l, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: l.title,
                url: `${SITE_ORIGIN}${l.path}`,
              })),
            },
          ]}
        />

        <header className="hero-wash relative overflow-hidden pb-12 pt-28 md:pb-16 md:pt-36">
          <div className="container-page">
            <div className="mx-auto max-w-3xl">
              <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name }]} />
              <p className="eyebrow mt-6">{eyebrow}</p>
              <h1 className="t-display mt-4 text-foreground">{title}</h1>
              <p className="t-lead mt-6 max-w-2xl">{lead}</p>
              {sections.length > 1 && (
                <nav aria-label={`${name} by section`} className="mt-8">
                  <ul className="flex flex-wrap gap-2">
                    {sections.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                          {s.label}
                          <span className="ml-2 text-muted">{s.items.length}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className="mt-8">
                <TrackedLink href="/demo" event="demo_cta_click" position={`${position}_hero`} className="btn btn-primary btn-lg">
                  Book a demo
                </TrackedLink>
              </div>
            </div>
          </div>
        </header>

        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-heading`}
            className={`section scroll-mt-24 border-t border-border ${i % 2 === 0 ? '' : 'bg-surface'}`}
          >
            <div className="container-page">
              <div className="mx-auto max-w-4xl">
                <h2 id={`${s.id}-heading`} className="t-h2 text-foreground">
                  {s.label}
                </h2>
                {s.blurb && <p className="t-lead mt-4 max-w-2xl">{s.blurb}</p>}
                <ul className="mt-8 grid gap-4 md:grid-cols-2">
                  {s.items.map((l) => (
                    <li key={l.path}>
                      <Link href={l.path} className="card group flex h-full flex-col p-6 transition-shadow hover:shadow-md">
                        <Icon className="h-5 w-5 text-primary" aria-hidden />
                        <span className="mt-3 text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary">{l.title}</span>
                        <span className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{l.description}</span>
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                          {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}

        <section className="section border-t border-border">
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <NotLegalAdvice />
            </div>
          </div>
        </section>

        <GeorgiaCta position={`${position}_end`} general />
      </main>
      <Footer />
    </>
  )
}
