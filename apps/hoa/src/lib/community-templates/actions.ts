'use server'

import { z } from 'zod'
import { getTemplate } from './registry'
import { renderCommunityEmailHtml, renderCommunityEmailText } from './render'
import { describeSections, hasContent, questionsFor, withoutSections } from './sections'
import type { TemplateQuestion } from './types'

/**
 * Re-render a community template with some sections switched off.
 *
 * The composer needs this on the server rather than in the browser for two
 * reasons: the registry is code, so shipping it to the client would put
 * every template's copy and legal note in the bundle; and
 * renderCommunityEmailHtml reads EMAIL_ASSET_BASE_URL, which is a
 * server-only variable and throws when unset.
 */

const Schema = z.object({
  topicSlug: z.string().min(1),
  excluded: z.array(z.number().int().min(0)).default([]),
})

export interface SectionRenderResult {
  ok: true
  bodyHtml: string
  bodyText: string
  /** Only the questions still referenced by a surviving section. */
  questions: readonly TemplateQuestion[]
  sections: ReturnType<typeof describeSections>
}

export type SectionRenderOutcome = SectionRenderResult | { ok: false; error: string }

export async function renderTemplateSections(
  input: z.infer<typeof Schema>,
): Promise<SectionRenderOutcome> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  const { topicSlug, excluded } = parsed.data

  const template = getTemplate(topicSlug)
  if (!template) {
    // A template row whose topic_slug has no registry entry — an org-authored
    // template, or a seed row from a newer deploy. The composer falls back to
    // the stored body_html, which is what it used before sections existed.
    return { ok: false, error: `No section data for "${topicSlug}".` }
  }

  if (!hasContent(template, excluded)) {
    return {
      ok: false,
      error: 'Keep at least one section — an email with every section removed has no message.',
    }
  }

  const trimmed = withoutSections(template, excluded)

  try {
    return {
      ok: true,
      bodyHtml: renderCommunityEmailHtml(trimmed),
      bodyText: renderCommunityEmailText(trimmed),
      questions: questionsFor(template, excluded),
      sections: describeSections(template),
    }
  } catch (err) {
    // emailAssetUrl throws when EMAIL_ASSET_BASE_URL is unset or points
    // somewhere unusable. Surface it rather than silently returning the
    // unfiltered body, which would look like the toggles did nothing.
    return { ok: false, error: (err as Error).message }
  }
}
