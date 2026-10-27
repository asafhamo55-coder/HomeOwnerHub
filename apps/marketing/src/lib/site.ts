// Where this marketing site lives, and the metadata every page shares.
//
// BL-157 (owner decision 2026-10-22, OA-30): this site serves
// www.homeownerledger.online. The HOA app stays on www.homeownerledger.com
// (see app-origin.ts); the apex homeownerledger.online also serves the app
// (OA-5, paused), so it is not one of this site's hosts. The site origin
// comes from NEXT_PUBLIC_SITE_URL so a preview can set its own, and falls
// back to www.homeownerledger.online. It is never an app host, and never
// anything off our domains: canonical URLs, the sitemap, robots.txt and OG
// images must point at the site people actually land on.
//
// No "@/..." imports here: marketing-truth.test.ts imports this module, and
// the root vitest config maps "@" to apps/hoa.

import type { Metadata } from 'next'
import { GENERAL_PATHS, GEORGIA_PATHS } from './georgia'
import { PROFESSIONALS_PATH } from './professionals'

export const DEFAULT_SITE_ORIGIN = 'https://www.homeownerledger.online'
export const SITE_NAME = 'HomeownerHub'

/** Hosts the marketing site may claim as its own origin. */
const SITE_HOSTS: ReadonlySet<string> = new Set(['www.homeownerledger.online'])

export function siteOrigin(configured: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const value = configured?.trim()
  if (!value) return DEFAULT_SITE_ORIGIN
  try {
    const url = new URL(value)
    // A preview deployment (*.vercel.app) or local dev may set its own.
    const allowed =
      SITE_HOSTS.has(url.hostname) || url.hostname.endsWith('.vercel.app') || url.hostname === 'localhost'
    return allowed ? url.origin : DEFAULT_SITE_ORIGIN
  } catch {
    return DEFAULT_SITE_ORIGIN
  }
}

export const SITE_ORIGIN = siteOrigin()

/** The site's host without "www.", for display (e.g. the share image). */
export const SITE_DISPLAY_HOST = new URL(SITE_ORIGIN).host.replace(/^www\./, '')

/**
 * Whether search engines may index this deployment: only the production
 * origin. A preview (*.vercel.app) or localhost gets "Disallow: /" so it
 * never competes with the real site.
 */
export function isIndexable(origin: string = SITE_ORIGIN): boolean {
  return origin === DEFAULT_SITE_ORIGIN
}

/**
 * Every page in the sitemap: the routes that render a page of their own.
 * Redirect-only routes (/case-studies/madison-park) are left out, and so are
 * /landlords and /eviction while the PM and Eviction hubs are not offered
 * (BL-097; they redirect to /hoa). marketing-truth.test.ts checks this list
 * against app/**\/page.tsx so a new page can't be forgotten.
 */
export const SITEMAP_PATHS: readonly string[] = [
  '/',
  '/hoa',
  '/pricing',
  '/compare',
  '/demo',
  ...GEORGIA_PATHS,
  ...GENERAL_PATHS,
  PROFESSIONALS_PATH,
  '/about',
  '/roadmap',
  '/honesty-bars',
  '/case-studies',
  '/security',
  '/docs',
  '/blog',
  '/status',
  '/privacy',
  '/terms',
  '/dpa',
]

/** The default OG image: app/opengraph-image.tsx, 1200x630. */
export const OG_IMAGE_PATH = '/opengraph-image'
export const OG_IMAGE_ALT = 'HomeownerHub — AI for self-managed HOA boards'

export interface PageMeta {
  /** Page title without the " · HomeownerHub" suffix the layout template adds. */
  title: string
  description: string
  /** Path on this site, starting with "/". Becomes the canonical URL. */
  path: string
}

/**
 * Metadata for one marketing page: title, description, a canonical URL on
 * the site origin, and Open Graph / Twitter tags that repeat them. Next
 * replaces (not merges) a page's openGraph over the layout's, so each page
 * sets the whole object through here. The OG image comes from the
 * app/opengraph-image.tsx file convention, which applies to every route.
 */
export function pageMetadata({ title, description, path }: PageMeta): Metadata {
  if (!path.startsWith('/')) throw new Error(`pageMetadata: path must start with "/" (${path})`)
  const ogTitle = `${title} · ${SITE_NAME}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: ogTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: OG_IMAGE_ALT }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [OG_IMAGE_PATH],
    },
  }
}
