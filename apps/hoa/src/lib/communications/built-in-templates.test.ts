import { describe, expect, it } from 'vitest'
import { buildMergeBag, type AnswerMap } from '@/lib/community-templates/merge-bag'
import type { TemplateQuestion } from '@/lib/community-templates/types'
import { BUILT_IN_TEMPLATES, isBuiltInTemplateId } from './built-in-templates'
import { buildRecipientBag } from './merge-bag'
import { renderForSchedule } from './partial-render'
import { extractMergeFields, renderTemplateStrict } from './templates'

/**
 * BL-102 A4: every built-in template must render through the real send
 * path with nothing left unfilled — with every question answered, and with
 * only the required ones answered (optional ones fall back).
 */

function sample(q: TemplateQuestion): string {
  switch (q.type) {
    case 'date':
      return '2026-11-30'
    case 'time':
      return '09:00'
    case 'select':
    case 'multiselect':
      return q.options![0]
    case 'number':
      return '3'
    default:
      return `Sample ${q.id}`
  }
}

/** Exactly what deliverOne renders against: the wizard's bag under the
 *  ambient per-recipient fields (merge-bag.ts). */
function renderAll(subject: string, body: string, answers: AnswerMap, questions: readonly TemplateQuestion[]) {
  const extraFields = buildMergeBag(questions, answers, {})
  const bag = buildRecipientBag({
    extraFields,
    recipient: { email: 'resident@example.test', recipient_name: 'Sam Rivera', unit_id: 'u1' },
    associationName: 'Lakeside HOA',
  })
  return { subject: renderTemplateStrict(subject, bag), body: renderTemplateStrict(body, bag), extraFields }
}

const ALLOWED_AMBIENT = new Set(['recipient_name', 'association_name'])

describe('built-in templates', () => {
  it('ships the seven the plan lists', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.name)).toEqual([
      'Dues reminder',
      'Meeting notice',
      'Water shutoff',
      'Pool closing',
      'Holiday office closure',
      'Welcome new owner',
      'Severe weather',
    ])
    expect(new Set(BUILT_IN_TEMPLATES.map((t) => t.id)).size).toBe(BUILT_IN_TEMPLATES.length)
    for (const t of BUILT_IN_TEMPLATES) expect(isBuiltInTemplateId(t.id)).toBe(true)
  })

  for (const t of BUILT_IN_TEMPLATES) {
    describe(t.name, () => {
      it('uses only merge fields the send can fill', () => {
        const questionIds = new Set(t.questions.map((q) => q.id))
        for (const field of extractMergeFields(`${t.subject}\n${t.bodyHtml}`)) {
          expect(questionIds.has(field) || ALLOWED_AMBIENT.has(field), `${t.id}: {{ ${field} }}`).toBe(true)
        }
        // Every question is used somewhere, so no answer is collected for nothing.
        const used = new Set(extractMergeFields(`${t.subject}\n${t.bodyHtml}`))
        for (const id of questionIds) expect(used.has(id), `${t.id}: question ${id} unused`).toBe(true)
      })

      it('gives every optional question a non-empty fallback', () => {
        for (const q of t.questions) if (!q.required) expect(q.fallback?.trim(), `${t.id}: ${q.id}`).toBeTruthy()
      })

      it('renders with every question answered and nothing unfilled', () => {
        const answers = Object.fromEntries(t.questions.map((q) => [q.id, sample(q)]))
        const out = renderAll(t.subject, t.bodyHtml, answers, t.questions)
        expect(out.subject).not.toMatch(/\{\{|\}\}/)
        expect(out.body).not.toMatch(/\{\{|\}\}/)
        expect(out.body).toContain('Lakeside HOA')
        expect(out.subject.length).toBeLessThanOrEqual(120)
      })

      it('renders with only the required questions answered', () => {
        const answers = Object.fromEntries(t.questions.filter((q) => q.required).map((q) => [q.id, sample(q)]))
        const out = renderAll(t.subject, t.bodyHtml, answers, t.questions)
        expect(out.body).not.toMatch(/\{\{|\}\}/)
        for (const q of t.questions) if (!q.required) expect(out.body).toContain(q.fallback!)
      })

      it('can be scheduled: answers bake in and only per-recipient fields remain', () => {
        const answers = Object.fromEntries(t.questions.filter((q) => q.required).map((q) => [q.id, sample(q)]))
        const extraFields = buildMergeBag(t.questions, answers, {})
        const baked = renderForSchedule({
          subject: t.subject,
          bodyHtml: t.bodyHtml,
          fields: extraFields,
          associationName: 'Lakeside HOA',
        })
        expect(baked.ok).toBe(true)
      })

      it('is plain language: no HTML jargon or merge-field talk in the copy', () => {
        expect(t.bodyHtml).not.toMatch(/merge field|variable|template/i)
        expect(t.bodyHtml).not.toMatch(/<(div|table|style|script)/i)
      })
    })
  }
})
