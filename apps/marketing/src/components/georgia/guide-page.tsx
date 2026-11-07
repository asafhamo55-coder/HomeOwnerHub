import * as React from 'react'
import { Check, Clock, ListTree, ShieldCheck } from 'lucide-react'
import { TrackedLink } from '@/components/site/tracked-link'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { articleLd, breadcrumbLd, faqLd, howToLd } from '@/lib/jsonld'
import { pathOf, type Guide } from '@/lib/georgia'
import { Breadcrumbs, GeorgiaCta, NotLegalAdvice, RelatedLinks } from './parts'
import { QUOTES, type QuoteId } from '@/lib/georgia-quotes'

/** Whole-guide word count over everything a reader sees, at 200 words a minute. */
export function readingMinutes(g: Guide): number {
  const text = [
    ...g.summary,
    ...g.sections.flatMap((s) => [s.heading, ...s.body, ...(s.list ?? []), ...(s.quotes ?? []).map((q) => QUOTES[q].quote)]),
    ...g.steps,
    ...g.faqs.flatMap((f) => [f.q, f.a]),
  ].join(' ')
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200))
}

/** A statute quote, verbatim, with its citation as a chip. */
function GuideQuote({ id }: { id: QuoteId }) {
  const q = QUOTES[id]
  return (
    <figure className="my-7 overflow-hidden rounded-2xl border border-border border-l-4 border-l-primary bg-primary-subtle/50 p-5 md:p-6">
      <blockquote className="font-serif text-[18px] leading-[1.7] text-foreground">“{q.quote}”</blockquote>
      <figcaption className="mt-4">
        <span className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs font-medium text-foreground-secondary">{q.cite}</span>
      </figcaption>
    </figure>
  )
}

function Toc({ items }: { items: { id: string; label: string }[] }) {
  const links = (
    <ol className="space-y-1">
      {items.map((t) => (
        <li key={t.id}>
          <a href={`#${t.id}`} className="block rounded-lg px-3 py-2.5 text-[15px] leading-snug text-foreground-secondary transition-colors hover:bg-primary-subtle hover:text-primary">
            {t.label}
          </a>
        </li>
      ))}
    </ol>
  )
  return (
    <>
      <details className="card mb-8 p-0 lg:hidden print:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 text-[16px] font-semibold text-foreground">
          <ListTree className="h-5 w-5 text-primary" aria-hidden /> In this guide
        </summary>
        <nav aria-label="In this guide" className="px-3 pb-3">{links}</nav>
      </details>
      <aside className="hidden lg:block print:hidden">
        <nav aria-label="Table of contents" className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <ListTree className="h-4 w-4" aria-hidden /> In this guide
          </p>
          {links}
        </nav>
      </aside>
    </>
  )
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function GuidePage({ guide }: { guide: Guide }) {
  const path = pathOf(guide)
  const general = !path.startsWith('/georgia/')
  const trail = guide.state ? [{ name: 'Home', href: '/' }, { name: 'State laws', href: '/states' }] : general ? [{ name: 'Home', href: '/' }] : [{ name: 'Home', href: '/' }, { name: 'Georgia', href: '/georgia' }]
  const minutes = readingMinutes(guide)
  const toc = [
    ...guide.sections.map((s, i) => ({ id: `sec-${i + 1}`, label: s.heading })),
    { id: 'next-steps', label: 'What to do next' },
    { id: 'hoa-does', label: 'What HomeownerHub does about this' },
    { id: 'faq', label: 'Frequently asked questions' },
  ]
  const ctaAfter = Math.min(1, guide.sections.length - 1)
  return (
    <>
      <Nav />
    <main id="main-content">
      <JsonLd
        data={[
          articleLd({ headline: guide.title, description: guide.description, path, datePublished: guide.datePublished, dateModified: guide.dateModified }),
          faqLd(guide.faqs),
          ...(guide.howTo ? [howToLd({ name: guide.title, description: guide.description, steps: guide.steps })] : []),
          breadcrumbLd([...trail.map((t) => ({ name: t.name, path: t.href })), { name: guide.metaTitle, path }]),
        ]}
      />

      <article>
        <header className="hero-wash relative overflow-hidden pb-12 pt-28 md:pb-16 md:pt-36">
          <div className="container-page">
            <div className="mx-auto max-w-3xl">
              <Breadcrumbs trail={[...trail, { name: guide.eyebrow }]} />
              <p className="eyebrow mt-6">{guide.eyebrow}</p>
              <h1 className="mt-4 text-[clamp(2rem,1.4rem+2.2vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.03em] text-foreground">
                {guide.title}
              </h1>
              <p className="mt-5 text-[15px] text-muted">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden />{minutes} min read</span>
                {' · '}Last reviewed <time dateTime={guide.dateModified}>{formatDate(guide.dateModified)}</time> · For volunteer boards
              </p>
            </div>
          </div>
        </header>

        <div className="container-page pb-16 pt-10">
          <div className="mx-auto grid max-w-6xl gap-x-12 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <Toc items={toc} />
            <div className="min-w-0 max-w-[44rem]">
            <section aria-labelledby="key-points" className="rounded-2xl border border-primary/20 bg-primary-subtle/60 p-6 md:p-7">
              <h2 id="key-points" className="text-lg font-semibold text-foreground">
                Key points
              </h2>
              <ul className="mt-4 space-y-3">
                {guide.summary.map((s) => (
                  <li key={s} className="flex gap-3 text-[17px] leading-relaxed text-foreground">
                    <Check className="mt-1.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-8">
              <NotLegalAdvice />
            </div>

            {guide.sections.map((s, i) => (
              <React.Fragment key={s.heading}>
              <section id={`sec-${i + 1}`} className="mt-14 scroll-mt-28">
                <h2 className="t-h2 !text-[26px] text-foreground md:!text-[30px]">{s.heading}</h2>
                {s.body.map((p) => (
                  <p key={p} className="mt-4 text-[18px] leading-[1.75] text-foreground-secondary">
                    {p}
                  </p>
                ))}
                {s.list && (
                  <ul className="mt-4 list-disc space-y-2 pl-6 text-[18px] leading-[1.7] text-foreground-secondary marker:text-primary">
                    {s.list.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                )}
                {s.quotes?.map((id) => <GuideQuote key={id} id={id} />)}
              </section>
              {i === ctaAfter && <InArticleCta slug={guide.slug} general={general} />}
              </React.Fragment>
            ))}

            <section id="next-steps" className="mt-14 scroll-mt-28" aria-labelledby="next-steps-h">
              <h2 id="next-steps-h" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
                What to do next
              </h2>
              <ol className="mt-5 space-y-3">
                {guide.steps.map((s, i) => (
                  <li key={s} className="flex gap-4 text-[18px] leading-relaxed text-foreground-secondary">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent-fg">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section id="hoa-does" className="mt-14 scroll-mt-28 rounded-2xl border border-border bg-surface p-6 md:p-7" aria-labelledby="hoa-does-h">
              <h2 id="hoa-does-h" className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                What HomeownerHub does about this
              </h2>
              {guide.hoaDoes.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {guide.hoaDoes.map((h) => (
                    <li key={h.text} className="text-[17px] leading-relaxed text-foreground-secondary">
                      {h.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-[17px] leading-relaxed text-foreground-secondary">{guide.hoaDoesNot}</p>
              )}
              <p className="mt-4 text-[15px] text-muted">The board approves every draft. HomeownerHub prepares paperwork and cites the law; it does not file for you or give legal advice.</p>
            </section>

            <section id="faq" className="mt-14 scroll-mt-28" aria-labelledby="faq-h">
              <h2 id="faq-h" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
                Frequently asked questions
              </h2>
              <dl className="card mt-5 divide-y divide-border">
                {guide.faqs.map((f) => (
                  <div key={f.q} className="px-6 py-5">
                    <dt className="text-[18px] font-semibold text-foreground">{f.q}</dt>
                    <dd className="mt-2 text-[17px] leading-relaxed text-foreground-secondary">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="mt-14">
              <RelatedLinks slugs={guide.related} hub={guide.state ? { href: '/states', label: 'All state laws' } : undefined} />
            </div>
            </div>
          </div>
        </div>
      </article>

      <GeorgiaCta position={`guide_${guide.slug}`} general={general} />
      </main>
    <Footer />
    </>
  )
}

/** Mid-article call to action. Only says what has shipped: a demo. */
function InArticleCta({ slug, general }: { slug: string; general: boolean }) {
  return (
    <aside aria-label="Book a demo" className="my-12 rounded-2xl border border-primary/20 bg-surface p-6 shadow-[0_18px_40px_-24px_hsl(var(--primary)/0.45)] md:p-7 print:hidden">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">For your board</p>
      <p className="mt-2 text-[20px] font-semibold leading-snug text-foreground">See this on your own governing documents</p>
      <p className="mt-2 text-[17px] leading-relaxed text-foreground-secondary">
        A short demo shows {general ? 'the tools' : 'the Georgia tools'} working from your rules. The board decides afterwards.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <TrackedLink href="/demo" event="demo_cta_click" position={`guide_inline_${slug}`} className="btn btn-primary btn-lg">
          Book a demo
        </TrackedLink>
      </div>
    </aside>
  )
}
