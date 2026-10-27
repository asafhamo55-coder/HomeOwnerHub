import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { articleLd, breadcrumbLd, faqLd } from '@/lib/jsonld'
import { guidePath } from '@/lib/georgia'
import type { Checklist } from '@/lib/georgia/checklists'
import { formatDate } from './guide-page'
import { Breadcrumbs, GeorgiaCta, NotLegalAdvice, PrintButton, Quote, RelatedLinks } from './parts'

/** A free, printable checklist. No sign-up, no email gate. */
export function ChecklistPage({ list }: { list: Checklist }) {
  const path = guidePath(list.slug)
  return (
    <main id="main-content">
      <Nav />
      <JsonLd
        data={[
          articleLd({ headline: list.title, description: list.description, path, datePublished: list.datePublished, dateModified: list.dateModified }),
          faqLd(list.faqs),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Georgia', path: '/georgia' },
            { name: list.title, path },
          ]),
        ]}
      />
      <article>
        <header className="hero-wash relative overflow-hidden pb-10 pt-28 md:pb-14 md:pt-36 print:pt-0">
          <div className="container-page">
            <div className="mx-auto max-w-3xl">
              <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Georgia', href: '/georgia' }, { name: 'Checklist' }]} />
              <p className="eyebrow mt-6 print:hidden">{list.eyebrow}</p>
              <h1 className="mt-4 text-[clamp(2rem,1.4rem+2.2vw,3.1rem)] font-[650] leading-[1.08] tracking-[-0.03em] text-foreground">
                {list.title}
              </h1>
              <p className="mt-4 text-sm text-muted">
                Updated <time dateTime={list.dateModified}>{formatDate(list.dateModified)}</time> · Free to print and share
              </p>
              <div className="mt-6">
                <PrintButton label="Print this checklist" />
              </div>
            </div>
          </div>
        </header>

        <div className="container-page pb-16">
          <div className="mx-auto max-w-3xl">
            {list.intro.map((p) => (
              <p key={p} className="mt-4 text-[17px] leading-[1.7] text-foreground-secondary">
                {p}
              </p>
            ))}

            <ol className="mt-8 space-y-3" aria-label="Checklist">
              {list.items.map((item) => (
                <li key={item.text} className="flex gap-4 rounded-xl border border-border bg-surface p-4 [break-inside:avoid]">
                  <span aria-hidden className="mt-1 inline-block h-5 w-5 shrink-0 rounded border-2 border-border-strong" />
                  <span>
                    <span className="block text-[16px] font-medium leading-snug text-foreground">{item.text}</span>
                    {item.detail && <span className="mt-1 block text-sm leading-relaxed text-foreground-secondary">{item.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>

            <section className="mt-12 [break-inside:avoid]">
              <h2 className="t-h3 text-foreground">The statute behind this checklist</h2>
              {list.quotes.map((id) => (
                <Quote key={id} id={id} />
              ))}
            </section>

            <div className="mt-8">
              <NotLegalAdvice />
            </div>

            <section className="mt-12 print:hidden" aria-labelledby="faq">
              <h2 id="faq" className="t-h3 text-foreground">
                Questions
              </h2>
              <dl className="card mt-5 divide-y divide-border">
                {list.faqs.map((f) => (
                  <div key={f.q} className="px-6 py-5">
                    <dt className="text-[16px] font-semibold text-foreground">{f.q}</dt>
                    <dd className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="mt-12">
              <RelatedLinks slugs={list.related} />
            </div>
          </div>
        </div>
      </article>
      <GeorgiaCta position={`checklist_${list.slug}`} />
      <Footer />
    </main>
  )
}
