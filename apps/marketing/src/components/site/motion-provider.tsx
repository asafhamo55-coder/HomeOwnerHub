'use client'

import { MotionConfig } from 'framer-motion'

// Every framer-motion animation on the site honours the visitor's
// "reduce motion" setting: transforms and layout animation are skipped,
// opacity fades stay.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
