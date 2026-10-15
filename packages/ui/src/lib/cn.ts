import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge must know the design system's custom scale names, or it
// misreads `text-2xs` as a colour and drops it when a `text-muted` follows
// (and vice versa). Keep in step with packages/ui/tailwind.config.ts.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs'] }],
      shadow: [{ shadow: ['xs'] }],
      duration: [{ duration: ['instant', 'fast', 'base', 'slow'] }],
      ease: [{ ease: ['standard', 'emphasized', 'exit'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
