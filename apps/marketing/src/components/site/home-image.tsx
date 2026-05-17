import Image from 'next/image'
import { cn } from '@/lib/cn'

interface HomeImageProps {
  src: string
  alt: string
  className?: string
  /** Width hint for Unsplash query string. Higher = sharper, slower. Default 1600. */
  width?: number
  /** Sizes hint for next/image responsive behavior. */
  sizes?: string
  priority?: boolean
  /** Tailwind class for the rounded variant — default lg. */
  rounded?: string
}

// Wraps Next.js Image with a consistent Unsplash treatment: appends sizing +
// format params to the URL, applies a soft inner shadow, lazy-loads by default.
// All photography on the site flows through this component so we have one
// place to tune quality, attribution, and the ring/shadow.
export function HomeImage({
  src,
  alt,
  className,
  width = 1600,
  sizes = '(min-width: 1024px) 50vw, 100vw',
  priority,
  rounded = 'rounded-2xl',
}: HomeImageProps) {
  const url = appendUnsplashParams(src, width)
  return (
    <div className={cn('relative overflow-hidden bg-ink-100', rounded, className)}>
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  )
}

function appendUnsplashParams(src: string, width: number) {
  if (!src.startsWith('https://images.unsplash.com')) return src
  // Strip any existing query and re-append a canonical set.
  const base = src.split('?')[0]
  return `${base}?w=${width}&q=80&auto=format&fit=crop`
}
