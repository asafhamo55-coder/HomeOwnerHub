import { BookOpen, ShieldCheck } from 'lucide-react'
import { APP_HOST } from '@/lib/app-origin'
import { LazyCovenantBrain } from './lazy-covenant-brain'

// "See it work": the interactive Covenant Brain sample, framed as an app
// window on the ink band. Sample documents, labelled as such.

export function SeeItWork() {
  return (
    <section id="see-it-work" className="section section-ink ink-glow scroll-mt-16">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">See it work</p>
          <h2 className="t-h2 mt-4 text-[#fff]">
            Ask a rule question. Get the section,{' '}
            <span className="t-serif text-primary">not a guess.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-foreground-secondary">
            Covenant Brain answers from your CC&amp;R and bylaws in plain English, cites the exact section, and says so
            when your documents don’t cover the question.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-5xl">
          <div className="app-window">
            <div className="flex items-center gap-1.5 border-b border-border bg-subtle/70 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
              <span className="ml-3 inline-flex items-center gap-1.5 truncate rounded-md bg-surface px-2.5 py-1 text-[11px] text-muted ring-1 ring-border">
                <BookOpen className="h-3 w-3" aria-hidden />
                {APP_HOST}/ai/ask
              </span>
              <span className="ml-auto hidden items-center gap-1 rounded-full bg-success-subtle px-2.5 py-0.5 text-[11px] font-semibold text-success sm:inline-flex">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Bar C · Production
              </span>
            </div>
            <LazyCovenantBrain />
          </div>
          <p className="mt-5 text-center text-sm text-muted">
            Sample documents. Every answer cited back to the document and audit-logged.
          </p>
        </div>
      </div>
    </section>
  )
}
