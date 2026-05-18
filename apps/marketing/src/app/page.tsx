import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { Hero } from '@/components/site/hero'
import { LogoStrip } from '@/components/site/logo-strip'
import { ProblemSolution } from '@/components/site/problem-solution'
import { ProductsBento } from '@/components/site/products-bento'
import { Agents } from '@/components/site/agents'
import { PullQuote } from '@/components/site/pull-quote'
import { Communities } from '@/components/site/communities'
import { TestimonialsMarquee } from '@/components/site/testimonials-marquee'
import { WorkflowsGrid } from '@/components/site/workflows-grid'
import { CaseStudy } from '@/components/site/case-study'
import { MidCta } from '@/components/site/mid-cta'
import { HowItWorks } from '@/components/site/how-it-works'
import { PricingTeaser } from '@/components/site/pricing-teaser'
import { CtaCloser } from '@/components/site/cta-closer'

export default function HomePage() {
  return (
    <main>
      <Nav />
      <Hero />
      <LogoStrip />
      <ProblemSolution />
      <ProductsBento />
      <Agents />
      <PullQuote />
      <Communities />
      <TestimonialsMarquee />
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
