import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { STATE_CARDS } from '@/lib/state-law'

// "State law built in": ONE section, four short cards. Product first
// (docs/decisions/2026-10-27-website-product-first-positioning.md): the
// workspace works for an HOA in any state, and state law is a benefit on
// top. Georgia's SB 406 hub is the first card, one of four. Every line comes
// from STATE_CARDS in lib/state-law.ts, which marketing-truth.test.ts checks
// against apps/hoa routes.

export function StateLawBuiltIn({ id = 'state-law' }: { id?: string }) {
  return (
    <section className="section scroll-mt-16 bg-surface" id={id}>
      <div className="container-page">
        <header className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">State law built in</p>
          <h2 className="t-h2 mt-4 text-foreground">
            Your state’s rules, <span className="t-serif text-primary">cited on every draft.</span>
          </h2>
          <p className="t-lead mt-5">
            The workspace works for an HOA in any state. For these four, the letters, notices and deadlines follow the
            statute and show the section they follow. Your board and your attorney still decide.
          </p>
        </header>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATE_CARDS.map((s) => (
            <li key={s.state} className="card card-hover group flex flex-col p-6">
              <span className="inline-flex h-8 min-w-8 items-center justify-center self-start rounded-lg bg-foreground px-2 text-xs font-bold text-background">
                {s.state}
              </span>
              <h3 className="t-h3 mt-5 text-foreground">{s.name}</h3>
              <p className="mt-2.5 flex-1 text-[15px] leading-relaxed text-foreground-secondary">{s.benefit}</p>
              <Link
                href={s.href}
                className="mt-5 inline-flex items-center gap-1.5 border-t border-border pt-4 text-sm font-semibold text-primary hover:underline"
              >
                {s.cta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-sm text-muted">
          <Link href="/states" className="font-semibold text-primary hover:underline">
            All state laws
          </Link>
          {' · '}Not legal advice.
        </p>
      </div>
    </section>
  )
}
