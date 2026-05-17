// Editorial pull quote between sections. No card frame, no shadow, no
// avatar circle. Just type — Linear's pattern.

export function PullQuote() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-page">
        <figure className="mx-auto max-w-4xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            From the founder
          </p>
          <blockquote className="mt-6 text-balance text-2xl font-medium leading-snug tracking-tight text-ink-900 md:text-[40px] md:leading-[1.15]">
            "Volunteer boards are running 180-home HOAs on Tuesday nights in
            their kitchens. The work AI was made for is sitting in their inboxes.
            We're the only platform built around that — not around a management
            company's billing schedule."
          </blockquote>
          <figcaption className="mt-8 flex items-center gap-3 border-t border-ink-200/70 pt-5 text-sm text-ink-600">
            <span className="font-semibold text-ink-900">Asaf Hamo</span>
            <span aria-hidden>·</span>
            <span>Founder, Ledger</span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
