import Link from 'next/link'
import { ArrowRight, BookOpen, ClipboardCheck } from 'lucide-react'
import { TrackedLink } from '@/components/site/tracked-link'
import { QUOTES, type QuoteId } from '@/lib/georgia-quotes'
import { GEORGIA_HUB_PATH, linkFor } from '@/lib/georgia'
import { PrintButtonClient } from './print-button'

export const NOT_LEGAL_ADVICE =
  'This page is general information for volunteer boards. It is not legal advice, and laws and documents differ. Ask your association’s attorney before you act on it.'

export function Breadcrumbs({ trail }: { trail: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted print:hidden">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((t, i) => (
          <li key={t.name} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>/</span>}
            {t.href ? (
              <Link href={t.href} className="hover:text-foreground">
                {t.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground-secondary">
                {t.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** A statute quote, verbatim, with its citation. */
export function Quote({ id }: { id: QuoteId }) {
  const q = QUOTES[id]
  return (
    <figure className="my-5 rounded-xl border border-border bg-subtle/60 p-5">
      <blockquote className="font-serif text-[15px] leading-relaxed text-foreground">“{q.quote}”</blockquote>
      <figcaption className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted">{q.cite}</figcaption>
    </figure>
  )
}

export function NotLegalAdvice() {
  return (
    <p className="rounded-xl border border-warning/30 bg-warning-subtle/40 p-4 text-sm leading-relaxed text-foreground-secondary">
      <strong className="font-semibold text-foreground">Not legal advice.</strong> {NOT_LEGAL_ADVICE}
    </p>
  )
}

export function RelatedLinks({ slugs, title = 'Keep reading', hub }: { slugs: readonly string[]; title?: string; hub?: { href: string; label: string } }) {
  return (
    <section aria-labelledby="related-heading" className="print:hidden">
      <h2 id="related-heading" className="t-h3 text-foreground">
        {title}
      </h2>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {slugs.map((s) => {
          const l = linkFor(s)
          return (
            <li key={s}>
              <Link href={l.path} className="card group flex h-full flex-col p-5 transition-shadow hover:shadow-md">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {l.kind === 'guide' ? <BookOpen className="h-3.5 w-3.5" aria-hidden /> : <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />}
                  {l.kind === 'guide' ? 'Guide' : 'Free tool'}
                </span>
                <span className="mt-2 text-[16px] font-semibold leading-snug text-foreground group-hover:text-primary">{l.title}</span>
                <span className="mt-2 text-sm leading-relaxed text-foreground-secondary">{l.blurb}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mt-5 text-sm">
        <Link href={hub?.href ?? GEORGIA_HUB_PATH} className="font-semibold text-primary hover:underline">
          {hub?.label ?? 'All Georgia guides and tools'}
        </Link>
      </p>
    </section>
  )
}

/** Closing demo call to action on every Georgia page. */
export function GeorgiaCta({ position = 'georgia_end', general = false }: { position?: string; general?: boolean }) {
  return (
    <section className="section section-ink ink-glow overflow-hidden print:hidden">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="t-h2 text-[#fff]">Want this handled for your board?</h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-foreground-secondary">
            Book a short demo. We load your governing documents and show {general ? 'the tools' : 'the Georgia tools'} on your own rules. The board
            decides afterwards. We reply within 1 business day.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <TrackedLink href="/demo" event="demo_cta_click" position={position} className="btn btn-lg btn-on-ink group">
              Book a demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </TrackedLink>
            <TrackedLink href="/demo" event="pilot_cta_click" position={position} className="btn btn-lg btn-ghost-ink">
              Start free trial
            </TrackedLink>
          </div>
          <p className="mt-6 text-sm text-muted">30-day free trial · No card needed · Not legal advice</p>
        </div>
      </div>
    </section>
  )
}

export function PrintButton({ label = 'Print this page' }: { label?: string }) {
  return <PrintButtonClient label={label} />
}
