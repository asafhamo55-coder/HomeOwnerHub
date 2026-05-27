import type { MetadataRoute } from 'next'

/**
 * Web app manifest. Powers "Add to Home Screen" on iOS Safari + Chrome
 * Android, and gives standalone-mode launch on both (no browser chrome,
 * looks/feels like a native app).
 *
 * Next.js automatically wires <link rel="manifest" href="/manifest.webmanifest">
 * into every page in this app's <head> when this file exports a default.
 *
 * Colors match the indigo brand in globals.css:
 *   --primary 244 76% 59%  → #4F46E5 (indigo-600)
 *   --background 220 33% 99% → #FAFBFD (cool off-white)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HOA Hub',
    short_name: 'HOA Hub',
    description: 'Run your HOA without the paperwork.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAFBFD',
    theme_color: '#4F46E5',
    orientation: 'portrait',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
