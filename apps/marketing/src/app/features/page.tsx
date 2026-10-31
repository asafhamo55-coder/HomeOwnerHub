import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpenText, Megaphone, ScrollText, Wallet, HardHat } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HeroCtas } from '@/components/site/hero-ctas'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/features']!, path: '/features' })

// One card per feature page. Each line describes a shipped workflow; online
// card/ACH payments are not shipped and are not mentioned.
const FEATURES = [
  {
    href: '/features/ask-your-documents',
    Icon: BookOpenText,
    title: 'Ask your documents',
    body: 'Ask a rule question in plain English. The answer cites your CC&R section or the state statute, and says so when your documents do not cover it.',
  },
  {
    href: '/features/violations',
    Icon: ScrollText,
    title: 'Violation letters',
    body: 'Send a photo and a caption. A letter is drafted with the rule cited, and it waits in Approvals until a board member decides.',
  },
  {
    href: '/features/dues-and-accounting',
    Icon: Wallet,
    title: 'Dues and accounting',
    body: 'Balances, late fees held to the state cap, scanned vendor bills and a month-end report emailed to the board.',
  },
  {
    href: '/features/announcements',
    Icon: Megaphone,
    title: 'Announcements',
    body: 'Write one sentence. Get a drafted announcement with audience and timing, a Spanish version for review, and results by home.',
  },
  {
    href: '/features/architecture-requests',
    Icon: HardHat,
    title: 'Architecture requests',
    body: 'Residents pre-check a project against your guidelines. The board gets a cited review and editable decision letters.',
  },
]

export default function FeaturesIndexPage() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <section className="hero-wash relative overflow-hidden pb-16 pt-32 md:pb-20 md:pt-40">
          <div className="container-page">
            <div className="max-w-3xl">
              <p className="eyebrow">See it work</p>
              <h1 className="t-display mt-5 text-foreground">Five jobs your board does every month.</h1>
              <p className="t-lead mt-6 max-w-2xl">
                Pick the one that eats your evenings. Each page walks through it step by step, with sample data.
              </p>
              <HeroCtas position="features_index" secondaryHref="/demo" secondaryLabel="Book a demo" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container-page">
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ href, Icon, title, body }) => (
                <li key={href}>
                  <Link href={href} className="card group flex h-full flex-col p-7 transition-shadow hover:shadow-lg">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
                    <p className="mt-2 flex-1 text-base leading-relaxed text-foreground-secondary">{body}</p>
                    <span className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-primary">
                      See how it works
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
