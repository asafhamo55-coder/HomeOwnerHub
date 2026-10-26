import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function CtaCloser() {
  return (
    <section className="section section-ink ink-glow overflow-hidden">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="t-display text-[#fff]">
            Stop volunteering for paperwork.{' '}
            <span className="t-serif text-[#8fb4ff]">Start governing.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-[#c3d0ea]">
            Ten minutes. We load your CC&amp;R, run Covenant Brain on your real rules, and let your board decide.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/demo" className="btn btn-lg btn-on-ink group">
              Start free pilot
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/roadmap" className="btn btn-lg btn-ghost-ink">
              Read the public roadmap
            </Link>
          </div>
          <p className="mt-8 text-sm text-[#a9b9d8]">Six-month free pilot · No data migration · Built in Atlanta</p>
        </div>
      </div>
    </section>
  )
}
