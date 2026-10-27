import { Check, ShieldCheck } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { articleLd, breadcrumbLd, faqLd } from '@/lib/jsonld'
import { guidePath, type Guide } from '@/lib/georgia'
import { Breadcrumbs, GeorgiaCta, NotLegalAdvice, Quote, RelatedLinks } from './parts'

export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function GuidePage({ guide }: { guide: Guide }) {
  const path = guidePath(guide.slug)
  return (
    <main id="main-content">
      <Nav />
      <JsonLd
        data={[
          articleLd({ headline: guide.title, description: guide.description, path, datePublished: guide.datePublished, dateModified: guide.dateModified }),
          faqLd(guide.faqs),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Georgia', path: '/georgia' },
            { name: guide.metaTitle, path },
          ]),
        ]}
      />

      <article>
        <header className="hero-wash relative overflow-hidden pb-12 pt-28 md:pb-16 md:pt-36">
          <div className="container-page">
            <div className="mx-auto max-w-3xl">
              <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Georgia', href: '/georgia' }, { name: guide.eyebrow }]} />
              <p className="eyebrow mt-6">{guide.eyebrow}</p>
              <h1 className="mt-4 text-[clamp(2rem,1.4rem+2.2vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.03em] text-foreground">
                {guide.title}
              </h1>
              <p className="mt-5 text-sm text-muted">
                Updated <time dateTime={guide.dateModified}>{formatDate(guide.dateModified)}</time> · For volunteer boards
              </p>
            </div>
          </div>
        </header>

        <div className="container-page pb-16">
          <div className="mx-auto max-w-3xl">
            <section aria-labelledby="key-points" className="card p-6 md:p-7">
              <h2 id="key-points" className="text-base font-semibold text-foreground">
                The short version
              </h2>
              <ul className="mt-4 space-y-3">
                {guide.summary.map((s) => (
                  <li key={s} className="flex gap-3 text-[15px] leading-relaxed text-foreground-secondary">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-8">
              <NotLegalAdvice />
            </div>

            {guide.sections.map((s) => (
              <section key={s.heading} className="mt-12">
                <h2 className="t-h2 !text-[26px] text-foreground md:!text-[30px]">{s.heading}</h2>
                {s.body.map((p) => (
                  <p key={p} className="mt-4 text-[17px] leading-[1.7] text-foreground-secondary">
                    {p}
                  </p>
                ))}
                {s.list && (
                  <ul className="mt-4 list-disc space-y-2 pl-6 text-[17px] leading-[1.65] text-foreground-secondary marker:text-muted">
                    {s.list.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                )}
                {s.quotes?.map((id) => <Quote key={id} id={id} />)}
              </section>
            ))}

            <section className="mt-14" aria-labelledby="next-steps">
              <h2 id="next-steps" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
                What to do next
              </h2>
              <ol className="mt-5 space-y-3">
                {guide.steps.map((s, i) => (
                  <li key={s} className="flex gap-4 text-[17px] leading-relaxed text-foreground-secondary">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-14 rounded-2xl border border-border bg-surface p-6 md:p-7" aria-labelledby="hoa-does">
              <h2 id="hoa-does" className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                What HomeownerHub does about this
              </h2>
              {guide.hoaDoes.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {guide.hoaDoes.map((h) => (
                    <li key={h.text} className="text-[15px] leading-relaxed text-foreground-secondary">
                      {h.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-[15px] leading-relaxed text-foreground-secondary">{guide.hoaDoesNot}</p>
              )}
              <p className="mt-4 text-xs text-muted">The board approves every draft. HomeownerHub prepares paperwork and cites the law; it does not file for you or give legal advice.</p>
            </section>

            <section className="mt-14" aria-labelledby="faq">
              <h2 id="faq" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
                Frequently asked questions
              </h2>
              <dl className="card mt-5 divide-y divide-border">
                {guide.faqs.map((f) => (
                  <div key={f.q} className="px-6 py-5">
                    <dt className="text-[16px] font-semibold text-foreground">{f.q}</dt>
                    <dd className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="mt-14">
              <RelatedLinks slugs={guide.related} />
            </div>
          </div>
        </div>
      </article>

      <GeorgiaCta position={`guide_${guide.slug}`} />
      <Footer />
    </main>
  )
}
