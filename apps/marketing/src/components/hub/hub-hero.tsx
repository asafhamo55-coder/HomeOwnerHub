import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { HubTheme } from './hub-theme'
import { cn } from '@/lib/cn'

interface HubHeroProps {
  theme: HubTheme
  eyebrow: string
  title: React.ReactNode
  subtitle: string
  primaryCta: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  visual: React.ReactNode
  /** The visual draws its own window chrome; don't wrap it. */
  bareVisual?: boolean
  /** Accepted for the (hidden) PM and Eviction pages; the redesigned hero draws no photo. */
  backdrop?: { src: string; alt: string }
  /** Optional stat trio shown below the CTAs. */
  stats?: { value: string; label: string }[]
}

// Product-page hero. Server component, same pattern as the home hero:
// headline and CTAs ship as HTML, the visual is built from HTML/CSS.
export function HubHero({
  theme,
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  visual,
  bareVisual,
  stats,
}: HubHeroProps) {
  return (
    <section className="hero-wash relative overflow-hidden pb-20 pt-28 md:pb-28 md:pt-36">
      <div className="container-page">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <p
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold',
                theme.badgeClass,
              )}
            >
              {eyebrow}
            </p>

            <h1 className="mt-6 text-[clamp(2.5rem,1.5rem+2.9vw,3.9rem)] font-[650] leading-[1.04] tracking-[-0.035em] text-foreground">
              {title}
            </h1>

            <p className="t-lead mt-6 max-w-xl">{subtitle}</p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={primaryCta.href} className={cn('btn btn-lg group', theme.buttonClass)}>
                {primaryCta.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {secondaryCta && (
                <Link href={secondaryCta.href} className="btn btn-secondary btn-lg">
                  {secondaryCta.label}
                </Link>
              )}
            </div>

            {stats && stats.length > 0 && (
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">{s.value}</dt>
                    <dd className="mt-1 text-[13px] leading-snug text-muted">{s.label}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {bareVisual ? visual : <div className="app-window">{visual}</div>}
        </div>
      </div>
    </section>
  )
}
