import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { Hero } from '@/components/site/hero'
import { GeorgiaFirst } from '@/components/site/georgia-first'
import { LogoStrip } from '@/components/site/logo-strip'
import { ProblemSolution } from '@/components/site/problem-solution'
import { ProductsBento } from '@/components/site/products-bento'
import { Agents } from '@/components/site/agents'
import { PullQuote } from '@/components/site/pull-quote'
import { Communities } from '@/components/site/communities'
import { WorkflowsGrid } from '@/components/site/workflows-grid'
import { CaseStudy } from '@/components/site/case-study'
import { MidCta } from '@/components/site/mid-cta'
import { HowItWorks } from '@/components/site/how-it-works'
import { PricingTeaser } from '@/components/site/pricing-teaser'
import { CtaCloser } from '@/components/site/cta-closer'
import { SITE_NAME, pageMetadata } from '@/lib/site'

// The home page keeps the layout's default title (no " · HomeownerHub"
// suffix) but needs its own canonical and OG URL.
const home = pageMetadata({
  title: SITE_NAME,
  description:
    'AI for self-managed HOA boards, Georgia first: the SB 406 registration kit, Georgia collections notices, quorum and proxies, the annual report for owners, plus cited answers from your governing documents, violation letters, announcements and the books. The board approves every draft.',
  path: '/',
})
export const metadata: Metadata = {
  ...home,
  title: { absolute: 'HomeownerHub — AI for self-managed HOA boards' },
  openGraph: { ...home.openGraph, title: 'HomeownerHub — AI for self-managed HOA boards' },
  twitter: { ...home.twitter, title: 'HomeownerHub — AI for self-managed HOA boards' },
}

export default function HomePage() {
  return (
    <main>
      <Nav />
      <Hero />
      <LogoStrip />
      <GeorgiaFirst moreHref={{ label: 'Everything for Georgia boards', href: '/hoa#georgia' }} />
      <ProblemSolution />
      <ProductsBento />
      <Agents />
      <PullQuote />
      <Communities />
      <WorkflowsGrid />
      <CaseStudy />
      <MidCta />
      <HowItWorks />
      <PricingTeaser />
      <CtaCloser />
      <Footer />
    </main>
  )
}
