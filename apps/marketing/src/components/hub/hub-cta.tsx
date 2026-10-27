import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { HubTheme } from './hub-theme'
import { TrackedLink } from '@/components/site/tracked-link'

interface HubCtaProps {
  theme: HubTheme
  title: React.ReactNode
  description: string
  primary: { label: string; href: string }
  secondary?: { label: string; href: string }
  footnote?: string
}

export function HubCta({ title, description, primary, secondary, footnote }: HubCtaProps) {
  return (
    <section className="section section-ink ink-glow overflow-hidden">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="t-h2 text-[#fff]">{title}</h2>
          <p className="mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-foreground-secondary">{description}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <TrackedLink href={primary.href} event="demo_cta_click" position="closing" className="btn btn-lg btn-on-ink group">
              {primary.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </TrackedLink>
            {secondary && (
              <Link href={secondary.href} className="btn btn-lg btn-ghost-ink">
                {secondary.label}
              </Link>
            )}
          </div>
          {footnote && <p className="mt-8 text-sm text-muted">{footnote}</p>}
        </div>
      </div>
    </section>
  )
}
