import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { Hero } from '@/components/site/hero'
import { Pillars } from '@/components/site/pillars'
import { HowItWorks } from '@/components/site/how-it-works'
import { StateLawBuiltIn } from '@/components/site/state-law-built-in'
import { TrustSecurity } from '@/components/site/trust-security'
import { PricingTeaser } from '@/components/site/pricing-teaser'
import { CtaCloser } from '@/components/site/cta-closer'
import { SITE_NAME, pageMetadata } from '@/lib/site'
import { HOME_TITLE, PAGE_META } from '@/lib/page-meta'

// The home page keeps the layout's default title (no " · HomeownerHub"
// suffix) but needs its own canonical and OG URL.
const home = pageMetadata({ title: SITE_NAME, description: PAGE_META['/']!.description, path: '/' })
export const metadata: Metadata = {
  ...home,
  title: { absolute: HOME_TITLE },
  openGraph: { ...home.openGraph, title: HOME_TITLE },
  twitter: { ...home.twitter, title: HOME_TITLE },
}

// Section order is a product decision (docs/decisions/2026-10-27-website-
// product-first-positioning.md): the workspace leads, state law is ONE
// section after "how it works", then trust, pricing and the closing CTA.
// marketing-truth.test.ts pins this order.
export default function HomePage() {
  return (
    <main id="main-content">
      <Nav />
      <Hero />
      <Pillars />
      <HowItWorks />
      <StateLawBuiltIn />
      <TrustSecurity />
      <PricingTeaser />
      <CtaCloser />
      <Footer />
    </main>
  )
}
