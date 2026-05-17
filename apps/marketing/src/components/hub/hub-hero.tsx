'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
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
  /** Optional Unsplash background photo. Renders soft, behind the type. */
  backdrop?: { src: string; alt: string }
  /** Optional stat trio shown below the CTAs. */
  stats?: { value: string; label: string }[]
}

export function HubHero({
  theme,
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  visual,
  backdrop,
  stats,
}: HubHeroProps) {
  return (
    <section className="relative overflow-hidden pt-24 md:pt-28">
      {backdrop && (
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[600px] [mask-image:linear-gradient(to_bottom,black_0%,black_50%,transparent_100%)]">
          <Image
            src={`${backdrop.src}?w=2400&q=80&auto=format&fit=crop`}
            alt={backdrop.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-[0.10]"
          />
        </div>
      )}

      <div className="container-page pt-10 md:pt-14">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid items-center gap-12 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:gap-16"
        >
          <div>
            <p className={cn('font-mono text-[11px] font-semibold uppercase tracking-[0.18em]', theme.accentText)}>
              {eyebrow}
            </p>

            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-5xl lg:text-[56px] lg:leading-[1.04]">
              {title}
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-600">
              {subtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={primaryCta.href}
                className={cn(
                  'group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-colors',
                  theme.buttonClass,
                )}
              >
                {primaryCta.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {secondaryCta && (
                <Link
                  href={secondaryCta.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-50"
                >
                  {secondaryCta.label}
                </Link>
              )}
            </div>

            {stats && stats.length > 0 && (
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-x-5 gap-y-2 border-t border-ink-200/80 pt-6">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className="font-mono text-2xl font-semibold tracking-tight text-ink-900">
                      {s.value}
                    </dt>
                    <dd className="mt-1 text-[11px] uppercase tracking-wider text-ink-500">
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white ring-hero">
              {visual}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
