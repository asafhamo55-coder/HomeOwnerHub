import type { MetadataRoute } from 'next'
import { SITE_ORIGIN, isIndexable } from '@/lib/site'

// /robots.txt. Only the production origin (www.homeownerledger.online) is
// indexable; a preview or local build disallows everything so it never
// competes with the real site. The app (www.homeownerledger.com) has its own.
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  }
}
