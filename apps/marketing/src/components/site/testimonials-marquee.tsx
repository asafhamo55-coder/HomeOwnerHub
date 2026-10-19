'use client'

import Image from 'next/image'
import { Quote } from 'lucide-react'
import { PORTRAITS } from '@/lib/photos'
import { cn } from '@/lib/cn'

interface Testimonial {
  name: string
  role: string
  community: string
  /** Tailwind gradient classes used as a ring around the portrait. */
  gradient: string
  quote: string
  /** Key into PORTRAITS catalog. */
  portrait: keyof typeof PORTRAITS
}

// Only real, attributable quotes belong here. Linda is the Madison Park
// reference quote, kept verbatim. Composite "typical feedback" quotes were
// removed on 2026-10-18 (BL-042): they read as real customers.
const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Linda',
    role: 'Treasurer',
    community: 'Madison Park HOA · 180 doors',
    gradient: 'from-primary to-accent',
    portrait: 'linda',
    quote:
      'I got my Tuesday nights back. Covenant Brain answers in seconds with the section cited. We caught a $4,200 reserve discrepancy in week three.',
  },
]

export function TestimonialsMarquee() {
  // Duplicate the array so the CSS translate animation seamlessly wraps.
  const track = [...TESTIMONIALS, ...TESTIMONIALS]

  return (
    <section className="overflow-hidden py-24 md:py-32">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-fg">
            Voices from the community
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Boards, residents, and landlords using HomeownerHub.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
            Early pilots and reference customers. First-name attribution while
            we onboard the next wave — full named case studies as they land.
          </p>
        </div>
      </div>

      {/* Marquee — full-bleed so cards bleed past the container edge. */}
      <div
        className="group relative mt-12"
        role="region"
        aria-roledescription="carousel"
        aria-label="Customer testimonials"
      >
        {/* Soft fade masks on either end so cards fade in / out instead of clipping. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-surface to-transparent md:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-surface to-transparent md:w-32" />

        <div
          className={cn(
            'flex w-max gap-4 will-change-transform',
            'animate-marquee group-hover:[animation-play-state:paused]',
            'motion-reduce:animate-none',
          )}
        >
          {track.map((t, i) => (
            <Card key={`${t.name}-${i}`} t={t} ariaHidden={i >= TESTIMONIALS.length} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Card({ t, ariaHidden }: { t: Testimonial; ariaHidden: boolean }) {
  const portrait = PORTRAITS[t.portrait]
  const url = `${portrait.src}?w=160&h=160&q=80&auto=format&fit=crop&crop=faces`
  return (
    <figure
      aria-hidden={ariaHidden}
      className="flex h-[280px] w-[340px] shrink-0 flex-col rounded-2xl border border-border/70 bg-surface p-6 md:w-[380px]"
    >
      <Quote className="h-4 w-4 text-accent-fg" aria-hidden="true" />
      <blockquote className="mt-3 line-clamp-5 flex-1 text-[14.5px] leading-relaxed text-foreground">
        {t.quote}
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3 border-t border-border/70 pt-4">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-subtle ring-1 ring-border">
          <Image
            src={url}
            alt={portrait.alt}
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {t.name} <span className="font-normal text-muted">· {t.role}</span>
          </p>
          <p className="truncate text-xs text-muted">{t.community}</p>
        </div>
      </figcaption>
    </figure>
  )
}
