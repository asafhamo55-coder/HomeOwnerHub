interface PageHeroProps {
  eyebrow: string
  title: React.ReactNode
  subtitle?: string
}

export function PageHero({ eyebrow, title, subtitle }: PageHeroProps) {
  return (
    <section className="hero-wash relative overflow-hidden pb-16 pt-32 md:pb-20 md:pt-40">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="t-display mt-5 text-foreground">{title}</h1>
          {subtitle && <p className="t-lead mx-auto mt-6 max-w-2xl">{subtitle}</p>}
        </div>
      </div>
    </section>
  )
}
