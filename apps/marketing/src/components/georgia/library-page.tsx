import * as React from 'react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { TrackedLink } from '@/components/site/tracked-link'
import { Breadcrumbs, GeorgiaCta, NotLegalAdvice } from '@/components/georgia/parts'
import { breadcrumbLd } from '@/lib/jsonld'
import { SITE_ORIGIN } from '@/lib/site'
import { LibraryFilter } from '@/components/georgia/library-filter'
import type { LibrarySection } from '@/lib/library'

export type { LibrarySection }

/** Shared shell for the /guides and /templates index pages: anchor chips, demo CTA, and the card list. The shell is static and server-rendered; the only client code is the filter island. */
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

        <LibraryFilter sections={sections} linkLabel={linkLabel} kind={path === '/guides' ? 'guide' : 'template'} noun={path === '/guides' ? 'guides' : 'templates'} />

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
