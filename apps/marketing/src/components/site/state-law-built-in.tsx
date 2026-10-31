import Link from 'next/link'
import { ArrowRight, Check, Scale } from 'lucide-react'
import { GEORGIA_FEATURES, STATE_CARDS } from '@/lib/state-law'

// "State law built in": ONE section. Georgia leads as a featured panel (the
// launch state, docs/decisions/2026-10-27-website-product-first-positioning.md
// and the Georgia-first memo), the other three states are short cards. The
// workspace works for an HOA in any state; state law is a benefit on top.
// Every line comes from lib/state-law.ts, which marketing-truth.test.ts
// checks against apps/hoa routes.

export function StateLawBuiltIn({ id = 'state-law' }: { id?: string }) {
  const ga = STATE_CARDS.find((s) => s.state === 'GA')!
  const others = STATE_CARDS.filter((s) => s.state !== 'GA')
  return (
    <section className="section section-warm scroll-mt-16" id={id}>
      <div className="container-page">
        <header className="reveal mx-auto max-w-3xl text-center">
          <p className="eyebrow !text-sm">State law built in</p>
          <h2 className="t-h2 mt-4 text-foreground">
            Your state’s rules, <span className="t-serif text-primary">cited on every draft.</span>
          </h2>
          <p className="t-lead mt-5">
            The workspace works for an HOA in any state. For these four, the letters, notices and deadlines follow the
            statute and show the section they follow. Your board and your attorney still decide.
          </p>
        </header>

        <div className="mt-14 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="section-ink reveal !m-0 flex flex-col p-8 sm:p-10">
            <div className="flex items-center gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ffffff1f] text-primary">
                <Scale className="h-7 w-7" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">Georgia first</p>
                <h3 className="text-2xl font-semibold text-foreground">Georgia SB 406</h3>
              </div>
            </div>
            <p className="mt-6 text-lg leading-relaxed text-foreground-secondary">
              Georgia boards get the most help today. Each tool below shows the code section it follows.
            </p>
            <ul className="mb-10 mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {GEORGIA_FEATURES.slice(0, 4).map((f) => (
                <li key={f.title} className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <div>
                    <p className="text-lg font-semibold leading-snug text-foreground">{f.title}</p>
                    <p className="mt-1 text-base text-muted">{f.citation}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link href={ga.href} className="btn btn-primary mt-auto self-start">
              {ga.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <ul className="grid gap-5">
            {others.map((s) => (
              <li key={s.state} className="card card-hover reveal flex items-start gap-5 p-6">
                <span className="inline-flex h-12 min-w-12 items-center justify-center rounded-xl bg-primary-subtle px-2 text-base font-bold text-primary">
                  {s.state}
                </span>
                <div>
                  <h3 className="t-h3 text-foreground">{s.name}</h3>
                  <p className="mt-1.5 text-lg leading-relaxed text-foreground-secondary">{s.benefit}</p>
                  <Link
                    href={s.href}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-primary hover:underline"
                  >
                    {s.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-10 text-center text-base text-muted">
          <Link href="/states" className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
            All state laws
          </Link>
          {' · '}Not legal advice.
        </p>
      </div>
    </section>
  )
}
