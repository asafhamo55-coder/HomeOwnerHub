'use client'

import { motion } from 'framer-motion'
import { PHOTOS } from '@/lib/photos'
import { HomeImage } from './home-image'

const items = [
  { photo: PHOTOS.suburbanAerial, label: 'Planned communities', sub: '50–800 doors' },
  { photo: PHOTOS.brickHomeManicured, label: 'Self-managed HOAs', sub: 'All-volunteer boards' },
  { photo: PHOTOS.grayWoodenHouse, label: 'Single-family rentals', sub: 'For 2–50 unit landlords' },
  { photo: PHOTOS.rockingChairsPorch, label: 'The residents you serve', sub: 'Multilingual comms · resident portal' },
]

export function Communities() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            Built for the homes you actually run
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Suburban Atlanta, not a SaaS demo deck.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            Ledger is built for the communities you can drive through on
            a Saturday morning. Volunteer boards. Brick-and-Hardie homes.
            Mature trees. Real residents.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="group relative overflow-hidden rounded-2xl ring-card"
            >
              <HomeImage
                src={item.photo.src}
                alt={item.photo.alt}
                className="aspect-[4/5] w-full"
                width={900}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                rounded=""
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900/85 via-ink-900/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="text-sm font-semibold tracking-tight">{item.label}</p>
                <p className="mt-1 text-xs text-white/80">{item.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
