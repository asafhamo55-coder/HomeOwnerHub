/**
 * End-to-end delivery guard.
 *
 * This is the test whose absence let two Critical defects reach the final
 * review. Every layer of this feature was individually correct and
 * individually tested, and nothing asserted that the layers were connected:
 *
 *   - the wizard pre-substituted with the NON-strict renderer, which blanks
 *     any placeholder it cannot resolve — destroying {{association_name}} and
 *     {{recipient_name}} before the send path could fill them, so every
 *     community email would have gone out reading "Hi ," from an unnamed
 *     association. That is verbatim the bug this feature exists to fix.
 *   - the lease-cap adapter had no production caller at all, so its six
 *     figures rendered empty and its refuse-to-send guard never ran.
 *
 * Neither is visible in any single file. Both are obvious the moment you
 * execute the whole path and read what actually arrives.
 *
 * So this test walks the real chain — registry -> stored body -> the wizard's
 * answer bag -> deliverOne's ambient-wins merge -> renderTemplateStrict — and
 * asserts on the DELIVERED string. If you add a layer, add it here too.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { COMMUNITY_TEMPLATES } from './registry'
import { renderCommunityEmailHtml } from './render'
import { buildMergeBag } from './merge-bag'
import { renderTemplateStrict } from '@/lib/communications/templates'
import type { TemplateQuestion } from './types'

beforeAll(() => {
  process.env.EMAIL_ASSET_BASE_URL = 'https://www.homeownerledger.com'
})

const ASSOCIATION = 'Madison Park'
const RECIPIENT = 'Sarah'

/** Answer every question the way a board member plausibly would. */
function answerAll(questions: readonly TemplateQuestion[]): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {}
  for (const q of questions) {
    if (q.type === 'multiselect') answers[q.id] = [q.options?.[0] ?? 'somewhere']
    else if (q.options?.length) answers[q.id] = q.options[0]
    else if (q.type === 'date') answers[q.id] = '2026-08-17'
    else if (q.type === 'time') answers[q.id] = '08:00'
    else if (q.type === 'number') answers[q.id] = '3'
    else answers[q.id] = 'a plausible answer'
  }
  return answers
}

/** Reproduces deliverOne's bag exactly: caller fields first, ambient wins. */
function deliveredBody(slug: string): string {
  const t = COMMUNITY_TEMPLATES.find((x) => x.slug === slug)
  if (!t) throw new Error(`no template ${slug}`)

  const extraFields = buildMergeBag(t.questions, answerAll(t.questions), {})
  // Fields the send path resolves from the database at delivery time.
  for (const f of t.providedFields ?? []) extraFields[f] = `[${f}]`

  return renderTemplateStrict(renderCommunityEmailHtml(t), {
    ...extraFields,
    owner_name: RECIPIENT,
    recipient_name: RECIPIENT,
    association_name: ASSOCIATION,
    unit_id: 'unit-1',
  })
}

describe.each(COMMUNITY_TEMPLATES.map((t) => [t.slug] as const))(
  'delivered email: %s',
  (slug) => {
    it('renders strictly — nothing unresolved reaches a resident', () => {
      const body = deliveredBody(slug)
      expect(body.match(/\{\{[a-zA-Z0-9_]+\}\}/g)).toBeNull()
    })

    it('names the community', () => {
      expect(deliveredBody(slug)).toContain(ASSOCIATION)
    })

    it('greets the recipient by name, not "Hi ,"', () => {
      const body = deliveredBody(slug)
      expect(body).not.toMatch(/Hi\s*,/)
      expect(body).toContain(RECIPIENT)
    })

    it('leaves no orphaned punctuation from a blanked value', () => {
      // "of  homes", "due on ." and friends — the signature of a silently
      // dropped merge field, which is what the old non-strict path produced.
      const text = deliveredBody(slug).replace(/<[^>]+>/g, ' ')
      expect(text).not.toMatch(/\s,/)
      expect(text).not.toMatch(/\s\./)
    })
  },
)

describe('the whole library', () => {
  it('delivers every template without throwing', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      expect(() => deliveredBody(t.slug), `${t.slug} failed to deliver`).not.toThrow()
    }
  })

  it('fails loudly when a required field is absent, rather than blanking it', () => {
    // The guarantee the whole design rests on: a half-rendered email must
    // never leave the system.
    const t = COMMUNITY_TEMPLATES[0]
    expect(() =>
      renderTemplateStrict(renderCommunityEmailHtml(t), {
        association_name: ASSOCIATION,
        recipient_name: RECIPIENT,
        owner_name: RECIPIENT,
        unit_id: 'unit-1',
      }),
    ).toThrow(/missing merge fields/i)
  })
})
