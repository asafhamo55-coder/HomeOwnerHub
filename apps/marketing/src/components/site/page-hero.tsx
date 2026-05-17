interface PageHeroProps {
  eyebrow: string
  title: React.ReactNode
  subtitle?: string
}

export function PageHero({ eyebrow, title, subtitle }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden pt-32 pb-16">
      <div className="container-page">
        <div className="mx-auto max-w-3xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            {eyebrow}
          </p>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-[56px] md:leading-[1.05]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
