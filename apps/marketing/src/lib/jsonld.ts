// Structured data (schema.org JSON-LD) builders. Pure, so tests can check
// them. Imports only ./site (no "@/..."): marketing-truth tests import this.

import { BAND_EDGES, HOA_PRICING, PRICING_V2, TRIAL_DAYS, bandMonthlyUsd } from './hoa-pricing'
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

/** Site-wide WebSite entity, linked to the Organization. No SearchAction: the site has no search. */
export function websiteLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    url: SITE_ORIGIN,
    name: SITE_NAME,
    inLanguage: 'en-US',
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
  }
}

/**
 * The product, with offers taken from lib/hoa-pricing.ts (the same numbers
 * /pricing shows and checkout charges). Prices are the entry price of each
 * plan; the size band raises them, which the offer description says. No
 * ratings or review counts: there are none to report.
 */
export function softwareApplicationLd(): JsonLdObject {
  const offers: JsonLdObject[] = PRICING_V2
    ? (['essentials', 'complete'] as const).map((plan) => ({
        '@type': 'Offer',
        name: plan === 'essentials' ? 'Essentials' : 'Complete',
        price: bandMonthlyUsd(plan, 1).toFixed(2),
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: bandMonthlyUsd(plan, 1).toFixed(2),
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          unitText: 'month',
        },
        description: `Starting price for up to ${BAND_EDGES[0]} homes; rises by community size band. ${TRIAL_DAYS}-day free trial.`,
        url: `${SITE_ORIGIN}/pricing`,
        availability: 'https://schema.org/InStock',
      }))
    : [
        {
          '@type': 'Offer',
          name: 'HOA Monthly',
          price: HOA_PRICING.PER_DOOR_USD.toFixed(2),
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: HOA_PRICING.PER_DOOR_USD.toFixed(2),
            priceCurrency: 'USD',
            billingDuration: 'P1M',
            unitText: 'door per month',
          },
          url: `${SITE_ORIGIN}/pricing`,
          availability: 'https://schema.org/InStock',
        },
      ]
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_ORIGIN}/#software`,
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'AI workspace for self-managed HOA boards: letters, notices, minutes and covenant answers drafted from your own documents. The board approves every draft.',
    url: SITE_ORIGIN,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    offers,
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

/** HowTo from an ordered list of steps (no images, tools or cost: we only claim what the page says). */
export function howToLd(h: { name: string; description: string; steps: readonly string[] }): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: h.name,
    description: h.description,
    step: h.steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
  }
}

/** JSON for a <script type="application/ld+json">: "<" escaped so text can't close the tag. */
export function jsonLdString(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
