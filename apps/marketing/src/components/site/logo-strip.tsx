// Confident single-line credibility band — replaces the icon-cluttered
// TrustStrip. No icons, no cards, no shadows. Just three facts in a row.

export function LogoStrip() {
  const items = [
    'Built for self-managed HOAs',
    'Your data, never sold',
    'Reviewed by Georgia counsel',
    'Citations on every legal answer',
  ]

  return (
    <section className="border-y border-border/60 bg-subtle/40">
      <div className="container-page py-5">
        <ul className="grid gap-x-8 gap-y-2 text-center md:flex md:items-center md:justify-between">
          {items.map((label) => (
            <li
              key={label}
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-secondary"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
