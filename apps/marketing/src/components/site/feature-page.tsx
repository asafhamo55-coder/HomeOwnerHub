import Link from 'next/link'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { Nav } from './nav'
import { Footer } from './footer'
import { HeroCtas } from './hero-ctas'
import { CtaCloser } from './cta-closer'
import { ApprovalsScreen, AnnouncementsScreen, AskScreen, DuesScreen, ViolationsScreen } from './tour-screens'
import { FEATURE_PAGES, featurePath, type FeatureScreen } from '../../lib/feature-pages'
import { cn } from '../../lib/cn'

// One template for every /features/<slug> page: breadcrumbs, H1 with a tinted
// keyword, the home hero's CTA pair and trial checklist, a product visual,
// benefit rows that alternate image and text, a related-features strip and
// the closing CTA. Content lives in lib/feature-pages.ts.

const SCREENS: Record<FeatureScreen, () => React.JSX.Element> = {
  approvals: ApprovalsScreen,
  dues: DuesScreen,
  violations: ViolationsScreen,
  announcements: AnnouncementsScreen,
  ask: AskScreen,
}

// STOPGAP: the in-repo HTML mockup stands in for a real screenshot (see the
// TODO in docs/decisions/2026-10-31-website-payhoa-quality-bar.md).
function Visual({ screen, label, tall, shift = 0 }: { screen: FeatureScreen; label: string; tall?: boolean; shift?: number }) {
  const Screen = SCREENS[screen]
  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={`${label}: sample screen with made-up data`}
        className={cn('overflow-hidden rounded-2xl border border-border bg-subtle shadow-[0_30px_60px_-30px_rgb(42_18_136/0.35)]', tall ? 'h-[320px] sm:h-[420px]' : 'h-[240px]')}
      >
        <div aria-hidden style={{ marginTop: -shift }} className="w-[640px] max-w-none origin-top-left scale-[0.55] sm:scale-[0.8] lg:scale-[0.7] xl:scale-[0.8]">
          <Screen />
        </div>
      </div>
      <figcaption className="mt-2 text-sm text-muted">Sample screen, made-up data.</figcaption>
    </figure>
  )
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
              <Visual screen={page.screen} label={page.label} tall />
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
                    <Visual screen={page.screen} label={b.title} />
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
