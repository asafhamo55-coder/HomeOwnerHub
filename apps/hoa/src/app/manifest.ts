import type { MetadataRoute } from 'next'
import { palette } from '@homeowner-portal/ui/tokens'

/**
 * Web app manifest. Powers "Add to Home Screen" on iOS Safari + Chrome
 * Android, and gives standalone-mode launch on both (no browser chrome,
 * looks/feels like a native app).
 *
 * Next.js automatically wires <link rel="manifest" href="/manifest.webmanifest">
 * into every page in this app's <head> when this file exports a default.
 *
 * Colours come from the HOA light palette in packages/ui/src/tokens.ts
 * (BL-095 blue); icons are the Ledger mark (BL-094) in public/brand/.
 */
const light = palette('hoa', 'light')

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HOA Hub',
    short_name: 'HOA Hub',
    description: 'Run your HOA without the paperwork.',
    start_url: '/',
    display: 'standalone',
    background_color: light.background,
    theme_color: light.primary,
    orientation: 'portrait',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/brand/logo-mark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/logo-mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }
}
