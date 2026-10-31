import Link from 'next/link'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { Nav } from './nav'
import { Footer } from './footer'
import { HeroCtas } from './hero-ctas'
import { CtaCloser } from './cta-closer'
import { ProcessPlayer } from './process-player'
import { PROCESSES, type ProcessId } from '../../lib/process-demos'
import { FEATURE_PAGES, featurePath, type FeatureScreen } from '../../lib/feature-pages'
import { cn } from '../../lib/cn'

// One template for every /features/<slug> page: breadcrumbs, H1 with a tinted
// keyword, the home hero's CTA pair and trial checklist, a product visual,
// benefit rows that alternate image and text, a related-features strip and
// the closing CTA. Content lives in lib/feature-pages.ts.

const PROCESS_FOR: Record<FeatureScreen, ProcessId> = {
  approvals: 'arc',
  dues: 'dues',
  violations: 'violations',
  announcements: 'announcements',
  ask: 'ask',
}

// Benefit rows replay two neighbouring scenes of the page's process, so each
// row shows a different part of the workflow.
function rowRange(process: ProcessId, i: number): [number, number] {
  const n = PROCESSES[process].scenes.length
  const start = i % (n - 1)
  return [start, start + 1]
}

export function FeaturePage({ slug }: { slug: string }) {
  const page = FEATURE_PAGES.find((p) => p.slug === slug)
  if (!page) return null
  const related = page.related.map((s) => FEATURE_PAGES.find((p) => p.slug === s)).filter((p) => !!p)

  return (
    <>
      <Nav />
      <main id="main-content">
        <section className="hero-wash">
          <div className="container-page">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:py-16">
              <div>
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap items-center gap-1.5 text-base text-muted">
                    <li>
                      <Link href="/" className="underline-offset-4 hover:underline">Home</Link>
                    </li>
                    <li aria-hidden><ChevronRight className="h-4 w-4" /></li>
                    <li>
                      <Link href="/hoa" className="underline-offset-4 hover:underline">Features</Link>
                    </li>
                    <li aria-hidden><ChevronRight className="h-4 w-4" /></li>
                    <li aria-current="page" className="text-foreground">{page.label}</li>
                  </ol>
                </nav>
                <h1 className="t-display mt-5 text-foreground">
                  {page.h1.before}
                  <span className="t-serif text-primary">{page.h1.keyword}</span>
                  {page.h1.after}
                </h1>
                <p className="t-lead mt-6 max-w-xl">{page.subhead}</p>
                <HeroCtas position="feature_hero" />
              </div>
              <ProcessPlayer process={PROCESS_FOR[page.screen]} />
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="benefits-h">
          <div className="container-page">
            <h2 id="benefits-h" className="t-h2 mx-auto max-w-2xl text-center text-foreground">
              What a board gets
            </h2>
            <div className="mt-14 space-y-16 md:space-y-24">
              {page.benefits.map((b, i) => (
                <div key={b.title} className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 md:grid-cols-2 md:gap-14">
                  <div className={cn('min-w-0', i % 2 === 1 && 'md:order-2')}>
                    <ProcessPlayer process={PROCESS_FOR[page.screen]} range={rowRange(PROCESS_FOR[page.screen], i)} compact />
                  </div>
                  <div>
                    <h3 className="t-h3 text-foreground">{b.title}</h3>
                    <p className="mt-3 text-lg text-foreground-secondary">{b.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-warm section" aria-labelledby="related-h">
          <div className="container-page">
            <h2 id="related-h" className="t-h2 text-center text-foreground">
              Related features
            </h2>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={featurePath(r.slug)} className="card card-hover group flex h-full flex-col p-7">
                    <span className="t-h3 text-foreground">{r.label}</span>
                    <span className="mt-2 flex-1 text-base text-foreground-secondary">{r.subhead}</span>
                    <span className="mt-4 inline-flex items-center gap-1 text-base font-semibold text-primary">
                      Learn more
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <CtaCloser />
      </main>
      <Footer />
    </>
  )
}
