import type { MetadataRoute } from 'next'
import { OTHER_HUBS_ENABLED, OTHER_HUB_PATHS } from '@/lib/hubs'
import { SITEMAP_PATHS, SITE_ORIGIN } from '@/lib/site'

// /sitemap.xml on the site's own origin (lib/site.ts). /landlords and
// /eviction only while those hubs are offered; today they redirect to /hoa
// (BL-097).
export default function sitemap(): MetadataRoute.Sitemap {
  const paths: string[] = [...SITEMAP_PATHS, ...(OTHER_HUBS_ENABLED ? OTHER_HUB_PATHS : [])]
  return paths.map((path) => ({
    url: `${SITE_ORIGIN}${path === '/' ? '' : path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : path === '/hoa' || path === '/pricing' ? 0.8 : 0.5,
  }))
}
