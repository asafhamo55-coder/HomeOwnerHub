'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { HubTheme } from './hub-theme'
import { cn } from '@/lib/cn'

interface HubCtaProps {
  theme: HubTheme
  title: React.ReactNode
  description: string
  primary: { label: string; href: string }
  secondary?: { label: string; href: string }
  footnote?: string
}

export function HubCta({ theme, title, description, primary, secondary, footnote }: HubCtaProps) {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className={cn('absolute inset-0 -z-10 bg-gradient-to-br', theme.bgGradient)} />
      <div className="absolute inset-0 -z-10 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <div className="container-page">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
            {description}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primary.href}
              className={cn(
                'group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:shadow-md',
                theme.buttonClass,
              )}
            >
              {primary.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="text-sm font-medium text-ink-700 hover:text-ink-900"
              >
                {secondary.label} →
              </Link>
            )}
          </div>
          {footnote && <p className="mt-8 text-xs text-ink-500">{footnote}</p>}
        </motion.div>
      </div>
    </section>
  )
}
