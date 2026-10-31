import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { Hero } from '@/components/site/hero'
import { FeatureExplorer } from '@/components/site/feature-explorer'
import { UpAndRunning } from '@/components/site/up-and-running'
import { StateLawBuiltIn } from '@/components/site/state-law-built-in'
import { TrustSecurity } from '@/components/site/trust-security'
import { PricingTeaser } from '@/components/site/pricing-teaser'
import { HomeFaq } from '@/components/site/home-faq'
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
// product-first-positioning.md, revised by 2026-10-31-website-payhoa-
// quality-bar.md): the workspace leads, then the feature explorer, a 3-step
// start, ONE state-law section, trust, pricing slider, FAQ and the closing
// CTA. marketing-truth.test.ts pins this order.
export default function HomePage() {
  return (
    <>
      <Nav />
    <main id="main-content">
      <Hero />
      <FeatureExplorer />
      <UpAndRunning />
      <StateLawBuiltIn />
      <TrustSecurity />
      <PricingTeaser />
      <HomeFaq />
      <CtaCloser />
      </main>
    <Footer />
    </>
  )
}
