'use client'

import { LazyMotion, MotionConfig } from 'framer-motion'

// Every framer-motion animation on the site honours the visitor's
// "reduce motion" setting: transforms and layout animation are skipped,
// opacity fades stay.
//
// Components use the slim `m` element, and the animation features load
// after first paint (SEO audit 2026-10-27: pages using the full `motion`
// element shipped 229-233 kB of first-load JS against a 200 kB budget).
const loadFeatures = () => import('./motion-features').then((mod) => mod.default)

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
