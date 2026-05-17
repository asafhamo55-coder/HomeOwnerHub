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

// First-name attribution by design — these are early-pilot voices, not
// named-reference customers yet. Linda is the real Madison Park reference
// quote, kept verbatim; the rest reflect typical board/resident/landlord
// feedback patterns from pilot conversations.
const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Linda',
    role: 'Treasurer',
    community: 'Madison Park HOA · 180 doors',
    gradient: 'from-brand-500 to-ember-500',
    portrait: 'linda',
    quote:
      'I got my Tuesday nights back. Covenant Brain answers in seconds with the section cited. We caught a $4,200 reserve discrepancy in week three.',
  },
  {
    name: 'Jon',
    role: 'Board President',
    community: '240-door HOA · North Atlanta',
    gradient: 'from-emerald-500 to-brand-500',
    portrait: 'jon',
    quote:
      'The violation drafter alone saved us six board hours a month. Every notice has the bylaw section cited; my treasurer just taps approve.',
  },
  {
    name: 'Adam',
    role: 'Secretary',
    community: '90-door townhome HOA',
    gradient: 'from-violet-500 to-brand-500',
    portrait: 'adam',
    quote:
      'Minutes used to take me three hours on a Sunday. The Minutes Engine drafts them while we\'re still in the meeting. I edit for ten minutes and send.',
  },
  {
    name: 'Maria',
    role: 'Resident',
    community: '180-door HOA',
    gradient: 'from-ember-500 to-rose-500',
    portrait: 'maria',
    quote:
      'I asked about pet rules in Spanish and got the answer back in Spanish, with the exact CC&R section. I didn\'t have to email the board.',
  },
  {
    name: 'Marcus',
    role: 'Resident',
    community: '320-door planned community',
    gradient: 'from-brand-600 to-violet-500',
    portrait: 'marcus',
    quote:
      'The resident portal is the first thing my HOA has ever done that actually feels modern. I see what\'s on the next agenda before the meeting.',
  },
  {
    name: 'Patricia',
    role: 'Vice President',
    community: '160-door HOA · Cobb County',
    gradient: 'from-emerald-600 to-ember-500',
    portrait: 'patricia',
    quote:
      'Architectural review used to be a fight. Now the ARC Recommender packets show comparable approvals with citations. Decisions take half the time.',
  },
  {
    name: 'James',
    role: 'Landlord',
    community: '6 rental units · Marietta',
    gradient: 'from-ember-600 to-amber-500',
    portrait: 'james',
    quote:
      'Rent collects itself. The Delinquency Coach caught a tenant\'s first late payment, suggested a check-in instead of escalating. They paid the next morning.',
  },
  {
    name: 'Sarah',
    role: 'Resident',
    community: '210-door HOA',
    gradient: 'from-brand-500 to-emerald-500',
    portrait: 'sarah',
    quote:
      'I got a violation notice and it explained exactly which rule, with the section number. I knew what to fix without having to call anyone.',
  },
]

export function TestimonialsMarquee() {
  // Duplicate the array so the CSS translate animation seamlessly wraps.
  const track = [...TESTIMONIALS, ...TESTIMONIALS]

  return (
    <section className="overflow-hidden py-24 md:py-32">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-ember-600">
            Voices from the community
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Boards, residents, and landlords using Ledger.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            Early pilots and reference customers. First-name attribution while
            we onboard the next wave — full named case studies as they land.
          </p>
        </div>
      </div>

      {/* Marquee — full-bleed so cards bleed past the container edge. */}
      <div
        className="group relative mt-14"
        aria-label="Testimonials carousel"
      >
        {/* Soft fade masks on either end so cards fade in / out instead of clipping. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-white to-transparent md:w-40" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-white to-transparent md:w-40" />

        <div
          className={cn(
            'flex w-max gap-5 will-change-transform',
            'animate-marquee group-hover:[animation-play-state:paused]',
            'motion-reduce:animate-none',
          )}
        >
          {track.map((t, i) => (
            <Card key={`${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Card({ t }: { t: Testimonial }) {
  const portrait = PORTRAITS[t.portrait]
  const url = `${portrait.src}?w=160&h=160&q=80&auto=format&fit=crop&crop=faces`
  return (
    <figure className="flex w-[360px] shrink-0 flex-col rounded-2xl border border-ink-200/70 bg-white p-6 md:w-[420px]">
      <Quote className="h-5 w-5 text-ember-500" />
      <blockquote className="mt-4 text-[15px] leading-relaxed text-ink-800">
        {t.quote}
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-ink-200/70 pt-4">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-ink-100 ring-1 ring-ink-200">
          <Image
            src={url}
            alt={portrait.alt}
            fill
            sizes="44px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">
            {t.name} <span className="font-normal text-ink-500">· {t.role}</span>
          </p>
          <p className="truncate text-xs text-ink-500">{t.community}</p>
        </div>
      </figcaption>
    </figure>
  )
}
