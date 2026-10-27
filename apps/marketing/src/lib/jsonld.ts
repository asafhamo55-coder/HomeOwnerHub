// Structured data (schema.org JSON-LD) builders. Pure, so tests can check
// them. Imports only ./site (no "@/..."): marketing-truth tests import this.

import { SITE_NAME, SITE_ORIGIN } from './site'

export type JsonLdObject = Record<string, unknown>

const abs = (path: string) => `${SITE_ORIGIN}${path === '/' ? '' : path}`

/** Site-wide. Only facts already on the site: name, URL, logo, support email. */
export function organizationLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/icon.svg`,
    description: 'AI for self-managed HOA boards, Georgia first. The board approves every draft.',
    email: 'support@homeownerledger.com',
  }
}

export interface FaqItem {
  q: string
  a: string
}

export function faqLd(items: readonly FaqItem[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  }
}

export function breadcrumbLd(trail: readonly { name: string; path: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: abs(t.path),
    })),
  }
}

export function articleLd(a: {
  headline: string
  description: string
  path: string
  datePublished: string
  dateModified: string
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.headline,
    description: a.description,
    mainEntityOfPage: abs(a.path),
    datePublished: a.datePublished,
    dateModified: a.dateModified,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
  }
}

/** JSON for a <script type="application/ld+json">: "<" escaped so text can't close the tag. */
export function jsonLdString(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
