'use server'

import { z } from 'zod'
import { getTemplate } from './registry'
import { renderCommunityEmailHtml, renderCommunityEmailText } from './render'
import {
  describeSections,
  hasContent,
  questionsFor,
  sectionsMissingAnswers,
  withoutSections,
} from './sections'
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
  /** Sections the board member switched off by hand. */
  excluded: z.array(z.number().int().min(0)).default([]),
  /** Question ids that currently have an answer. Sections referencing a
   *  question NOT in this list are dropped automatically — that is what
   *  makes every non-subject question optional. */
  answered: z.array(z.string()).default([]),
})

export interface SectionRenderResult {
  ok: true
  bodyHtml: string
  bodyText: string
  /** Only the questions still referenced by a surviving section. */
  questions: readonly TemplateQuestion[]
  sections: ReturnType<typeof describeSections>
  /** Sections dropped because a field they use has no answer yet. The
   *  composer greys these rather than showing them as user choices, so
   *  "why is my paragraph missing" has a visible answer. */
  autoExcluded: number[]
}

export type SectionRenderOutcome = SectionRenderResult | { ok: false; error: string }

export async function renderTemplateSections(
  input: z.infer<typeof Schema>,
): Promise<SectionRenderOutcome> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  const { topicSlug, excluded, answered } = parsed.data

  const template = getTemplate(topicSlug)
  if (!template) {
    // A template row whose topic_slug has no registry entry — an org-authored
    // template, or a seed row from a newer deploy. The composer falls back to
    // the stored body_html, which is what it used before sections existed.
    return { ok: false, error: `No section data for "${topicSlug}".` }
  }

  // A blank answer removes its section rather than substituting filler.
  const autoExcluded = sectionsMissingAnswers(template, answered)
  const allExcluded = [...new Set([...excluded, ...autoExcluded])]

  if (!hasContent(template, allExcluded)) {
    return {
      ok: false,
      error:
        'Nothing left to send. Either answer a question above or switch a section back on — every section is currently excluded or waiting on an answer.',
    }
  }

  const trimmed = withoutSections(template, allExcluded)

  try {
    return {
      ok: true,
      bodyHtml: renderCommunityEmailHtml(trimmed),
      bodyText: renderCommunityEmailText(trimmed),
      // Deliberately keyed on the MANUAL exclusions only: a question must
      // keep being asked while it is unanswered, otherwise auto-dropping its
      // section would remove the very question needed to bring it back.
      questions: questionsFor(template, excluded),
      sections: describeSections(template),
      autoExcluded,
    }
  } catch (err) {
    // emailAssetUrl throws when EMAIL_ASSET_BASE_URL is unset or points
    // somewhere unusable. Surface it rather than silently returning the
    // unfiltered body, which would look like the toggles did nothing.
    return { ok: false, error: (err as Error).message }
  }
}
