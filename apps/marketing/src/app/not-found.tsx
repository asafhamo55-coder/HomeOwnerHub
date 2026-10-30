import * as React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '../components/site/nav'
import { Footer } from '../components/site/footer'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
}

const NOT_FOUND_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/guides', label: 'HOA guides' },
  { href: '/templates', label: 'Free templates' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/states', label: 'State laws' },
  { href: '/demo', label: 'Book a demo' },
] as const

export default function NotFound() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <section className="hero-wash relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
          <div className="container-page">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow">Error 404</p>
              <h1 className="t-display mt-5 text-foreground">We couldn&apos;t find that page.</h1>
              <p className="t-lead mx-auto mt-6 max-w-xl">
                The link may be old or mistyped. These are the pages people look for most.
              </p>
              <ul className="mt-10 flex flex-wrap justify-center gap-3">
                {NOT_FOUND_LINKS.map((l, i) => (
                  <li key={l.href}>
                    <Link href={l.href} className={i === 0 ? 'btn btn-primary' : 'btn btn-secondary'}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
