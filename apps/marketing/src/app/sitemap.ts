import type { MetadataRoute } from 'next'
import { OTHER_HUBS_ENABLED, OTHER_HUB_PATHS } from '@/lib/hubs'
import { ALL_GUIDES, CHECKLISTS, GEORGIA_UPDATED, pathOf } from '@/lib/georgia'
import { PROFESSIONALS_PATH, PROFESSIONALS_UPDATED } from '@/lib/professionals'
import { SITEMAP_PATHS, SITE_ORIGIN } from '@/lib/site'

// lastModified is the date a page's content last changed, not the build
// date, so crawlers aren't told that every page changes on every deploy.
const GUIDE_DATES = new Map<string, string>([
  ...[...ALL_GUIDES, ...Object.values(CHECKLISTS)].map((g) => [pathOf(g), g.dateModified] as [string, string]),
  [PROFESSIONALS_PATH, PROFESSIONALS_UPDATED],
])
const SITE_CONTENT_UPDATED = '2026-10-26'
function lastModified(path: string): Date {
  return new Date(`${GUIDE_DATES.get(path) ?? (path.startsWith('/georgia') ? GEORGIA_UPDATED : SITE_CONTENT_UPDATED)}T00:00:00Z`)
}

// /sitemap.xml on the site's own origin (lib/site.ts). /landlords and
// /eviction only while those hubs are offered; today they redirect to /hoa
// (BL-097).
export default function sitemap(): MetadataRoute.Sitemap {
  const paths: string[] = [...SITEMAP_PATHS, ...(OTHER_HUBS_ENABLED ? OTHER_HUB_PATHS : [])]
  return paths.map((path) => ({
    url: `${SITE_ORIGIN}${path === '/' ? '' : path}`,
    lastModified: lastModified(path),
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : path === '/hoa' || path === '/pricing' || path === '/georgia' ? 0.8 : path.startsWith('/georgia/') || path.startsWith('/guides/') || path.startsWith('/templates/') ? 0.7 : 0.5,
  }))
}
