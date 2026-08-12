import { describe, it, expect, beforeAll } from 'vitest'
import { renderCommunityEmailHtml, renderCommunityEmailText } from './render'
import type { CommunityTemplate } from './types'

beforeAll(() => {
  process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'
})

const T: CommunityTemplate = {
  slug: 'pet-waste',
  name: 'Pet Waste — Community Reminder',
  description: 'A friendly nudge.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#1C6772',
  visual: { kind: 'illustration', asset: 'dog-leash-and-waste.png', alt: 'A dog owner at a waste station' },
  subject: 'A friendly reminder about pet waste in {{association_name}}',
  preview: 'Four waste stations, all stocked with bags.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    { type: 'paragraph', text: "We've had reports near {{affected_areas}}." },
    { type: 'visual' },
    { type: 'callout', text: 'Bag stations: {{station_locations}}.' },
  ],
  questions: [
    { id: 'affected_areas', label: 'Which areas?', type: 'multiselect', options: ['East entrance'], required: true },
    { id: 'station_locations', label: 'Where are the stations?', type: 'text', required: true },
  ],
}

describe('renderCommunityEmailHtml', () => {
  it('puts the community name in an accent band above the body', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html).toContain('bgcolor="#1C6772"')
    expect(html).toContain('{{association_name}}')
  })

  it('places the headline and first paragraph BEFORE the visual', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html.indexOf('Hi {{recipient_name}}')).toBeLessThan(html.indexOf('<img'))
  })

  it('preserves merge placeholders untouched for the strict renderer', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html).toContain('{{affected_areas}}')
    expect(html).toContain('{{station_locations}}')
  })

  it('is a complete document with the preview line', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html).toMatch(/^<!DOCTYPE/i)
    expect(html).toContain('Four waste stations')
  })

  it('remains complete and actionable with every img removed', () => {
    const stripped = renderCommunityEmailHtml(T).replace(/<img[^>]*>/g, '')
    expect(stripped).toContain('{{affected_areas}}')
    expect(stripped).toContain('{{station_locations}}')
    expect(stripped).toContain('Hi {{recipient_name}}')
  })

  it('rejects an accent outside the dark-mode-safe window', () => {
    expect(() => renderCommunityEmailHtml({ ...T, accentColor: '#A8E6C4' })).toThrow(/luminance/i)
  })

  it('sets a foreground on every background', () => {
    const html = renderCommunityEmailHtml(T)
    for (const m of html.matchAll(/style="([^"]*background-color:[^"]*)"/g)) {
      expect(m[1], `background without color: ${m[1]}`).toContain('color:')
    }
  })
})

describe('renderCommunityEmailText', () => {
  it('carries the same placeholders and drops the visual', () => {
    const text = renderCommunityEmailText(T)
    expect(text).toContain('{{affected_areas}}')
    expect(text).toContain('{{station_locations}}')
    expect(text).not.toContain('<')
  })
})

const T_LIST: CommunityTemplate = {
  ...T,
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'list',
      items: ['Bag stations at {{station_locations}}', 'Report violations <here> & now'],
    },
  ],
}

const T_CTA: CommunityTemplate = {
  ...T,
  cta: { label: 'See the station map', urlField: 'station_map_url' },
}

describe('list blocks', () => {
  it('renders list items as escaped <li> elements in HTML, placeholders intact', () => {
    const html = renderCommunityEmailHtml(T_LIST)
    expect(html).toContain('<li')
    expect(html).toContain('Bag stations at {{station_locations}}')
    expect(html).toContain('Report violations &lt;here&gt; &amp; now')
  })

  it('renders list items in the text output', () => {
    const text = renderCommunityEmailText(T_LIST)
    expect(text).toContain('Bag stations at {{station_locations}}')
    expect(text).toContain('Report violations <here> & now')
  })
})

describe('cta', () => {
  it('carries the CTA url placeholder and label in the HTML output', () => {
    const html = renderCommunityEmailHtml(T_CTA)
    expect(html).toContain('{{station_map_url}}')
    expect(html).toContain('See the station map')
  })

  it('carries the CTA url placeholder and label in the text output', () => {
    const text = renderCommunityEmailText(T_CTA)
    expect(text).toContain('{{station_map_url}}')
    expect(text).toContain('See the station map')
  })
})
