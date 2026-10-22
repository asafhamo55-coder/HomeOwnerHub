// Where this marketing site lives, and the metadata every page shares.
//
// Domain split (docs/specs/2026-10-19-domain-split.md): this site serves
// www.homeownerledger.com (the apex redirects to www); the HOA app serves
// homeownerledger.online (see app-origin.ts). The site origin comes from
// NEXT_PUBLIC_SITE_URL so a preview can set its own, and falls back to www.
// It is never the app host, and never anything off our domain: canonical
// URLs and OG images must point at the site people actually land on.
//
// No "@/..." imports here: marketing-truth.test.ts imports this module, and
// the root vitest config maps "@" to apps/hoa.

import type { Metadata } from 'next'

export const DEFAULT_SITE_ORIGIN = 'https://www.homeownerledger.com'
export const SITE_NAME = 'HomeownerHub'

/** Hosts the marketing site may claim as its own origin. */
const SITE_HOSTS: ReadonlySet<string> = new Set(['www.homeownerledger.com', 'homeownerledger.com'])

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
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
    },
  }
}
