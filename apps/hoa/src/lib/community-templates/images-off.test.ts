/**
 * The invariant from §7.6 of the design spec:
 *
 *   Delete every <img> and the email must still be complete and actionable.
 *
 * Classic Outlook and Office 365 OWA block remote images by default. For a
 * meaningful share of recipients the alt text IS the visual block. If a
 * template ever puts the deadline, the affected streets or the event date
 * only in the image, those recipients get an unusable email — and nobody
 * notices, because the people testing it use Gmail.
 *
 * What this guard proves, and what it does not:
 *
 *   - It proves that every declared merge field, the community name, and a
 *     substantial amount of readable text all survive when every <img> tag
 *     is deleted from the rendered HTML — i.e. the email reads and remains
 *     actionable with images blocked, exactly as Outlook/OWA recipients see
 *     it by default.
 *   - It does NOT prove that images ever load. The production asset host
 *     currently redirects `/email/v1/*.png` to `/login` (auth middleware
 *     covers `public/`), so today images fail to load for every recipient,
 *     not just image-blocked ones. That is a separate, as-yet-unfixed
 *     problem. A green run here says nothing about image reachability —
 *     don't mistake it for "images work".
 */

import { describe, it, expect } from 'vitest'
import { COMMUNITY_TEMPLATES } from './registry'
import { renderCommunityEmailHtml } from './render'
import { findBackgroundWithoutColor } from '@/lib/email/test-helpers'

// Set at module scope, not in beforeAll: describe.each's factory below calls
// renderCommunityEmailHtml() directly (so the html is shared across all six
// `it` blocks per template) and that call happens during test COLLECTION,
// which completes before any beforeAll hook runs. A beforeAll here would set
// the env var too late and renderVisualBlock would throw on every template.
process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'

function stripImages(html: string): string {
  return html.replace(/<img[^>]*>/gi, '')
}

function textOf(html: string): string {
  return stripImages(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

describe.each(COMMUNITY_TEMPLATES.map((t) => [t.slug, t] as const))(
  'images-off: %s',
  (_slug, t) => {
    const html = renderCommunityEmailHtml(t)

    it('every declared merge field survives image removal', () => {
      const stripped = stripImages(html)
      for (const q of t.questions) {
        expect(stripped, `{{${q.id}}} only appears inside an image`).toContain(`{{${q.id}}}`)
      }
    })

    it('still has substantial readable text', () => {
      expect(textOf(html).length).toBeGreaterThan(200)
    })

    it('names the community in text', () => {
      expect(textOf(html)).toContain('{{association_name}}')
    })

    it('has at most one image', () => {
      expect((html.match(/<img/gi) ?? []).length).toBeLessThanOrEqual(1)
    })

    it('sets a foreground on every background', () => {
      // Uses the shared helper, NOT `toContain('color:')` — that assertion is
      // vacuous, because "background-color:" itself contains "color:".
      const violations = findBackgroundWithoutColor(html)
      expect(violations, `background without color in ${t.slug}`).toEqual([])
    })

    it('uses no gradient, flexbox or grid', () => {
      expect(html).not.toMatch(/gradient|display:\s*flex|display:\s*grid/)
    })
  },
)
