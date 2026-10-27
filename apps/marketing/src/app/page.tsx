import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { Hero } from '@/components/site/hero'
import { GeorgiaFirst } from '@/components/site/georgia-first'
import { LogoStrip } from '@/components/site/logo-strip'
import { ProblemSolution } from '@/components/site/problem-solution'
import { SeeItWork } from '@/components/site/see-it-work'
import { Pillars } from '@/components/site/pillars'
import { HowItWorks } from '@/components/site/how-it-works'
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

// Section order is a product decision: Georgia leads (BL-157), so the
// Georgia section sits right under the hero and before the generic pitch.
export default function HomePage() {
  return (
    <main id="main-content">
      <Nav />
      <Hero />
      <LogoStrip />
      <GeorgiaFirst moreHref={{ label: 'Georgia guides and free tools', href: '/georgia' }} />
      <ProblemSolution />
      <SeeItWork />
      <Pillars />
      <HowItWorks />
      <TrustSecurity />
      <PricingTeaser />
      <CtaCloser />
      <Footer />
    </main>
  )
}
