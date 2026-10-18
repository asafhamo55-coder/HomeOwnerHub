/**
 * "Ask the guide" eval (spec §6.3, §11). Pure: takes the parsed question
 * set and returns per-question outcomes plus the three acceptance metrics.
 *
 * Retrieval mode (CI) runs only the deterministic half of the pipeline —
 * the rules classifier, BM25 retrieval and the gate — exactly as
 * /api/help/ask runs them. No model is called. Model mode (opt-in, see
 * scripts/guide-eval.ts) additionally checks what the model answered, after
 * server-side validation.
 */
import { z } from 'zod'
import {
  isRulesQuestion,
  passesGate,
  retrieve,
  topScore,
  type AskViewerRole,
} from '../../apps/hoa/src/lib/guide/ask-core'

export const EvalQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  q: z.string().min(3).max(500),
  role: z.enum(['admin', 'board', 'resident']),
  expect: z.string().regex(/^[a-z0-9-]+$/),
  route: z.string().startsWith('/').max(200).optional(),
})
export const EvalSetSchema = z.object({ questions: z.array(EvalQuestionSchema).min(1) })
export type EvalQuestion = z.infer<typeof EvalQuestionSchema>

export type EvalKind = 'howto' | 'refuse' | 'rules'
export const kindOf = (q: EvalQuestion): EvalKind => (q.expect === 'refuse' ? 'refuse' : q.expect === 'rules' ? 'rules' : 'howto')

/** Acceptance bars (spec §11). */
export const TARGETS = { hitAt3: 0.9, refusal: 0.9, rulesRouted: 0.8 } as const

export interface EvalOutcome {
  id: string
  kind: EvalKind
  pass: boolean
  /** What the pipeline did: rules_question, not_covered (gated) or to_model. */
  outcome: 'rules_question' | 'not_covered' | 'to_model'
  top3: string[]
  topScore: number
  /** Why it failed, in ids and numbers only. */
  reason?: string
}

export interface EvalReport {
  outcomes: EvalOutcome[]
  hitAt3: number
  refusal: number
  rulesRouted: number
  counts: Record<EvalKind, number>
  pass: boolean
}

export function evaluateQuestion(q: EvalQuestion): EvalOutcome {
  const kind = kindOf(q)
  const role = q.role as AskViewerRole
  if (isRulesQuestion(q.q)) {
    return { id: q.id, kind, pass: kind === 'rules', outcome: 'rules_question', top3: [], topScore: 0, ...(kind === 'rules' ? {} : { reason: 'classified as a rules question' }) }
  }
  const sources = retrieve(q.q, role, q.route)
  const top3 = [...new Set(sources.map((s) => s.articleId))].slice(0, 3)
  const score = topScore(sources)
  const gated = !passesGate(sources)
  const outcome = gated ? 'not_covered' : 'to_model'
  if (kind === 'rules') return { id: q.id, kind, pass: false, outcome, top3, topScore: score, reason: 'not classified as a rules question' }
  if (kind === 'refuse') return { id: q.id, kind, pass: gated, outcome, top3, topScore: score, ...(gated ? {} : { reason: 'gate let it through' }) }
  const hit = top3.includes(q.expect)
  const pass = hit && !gated
  return {
    id: q.id,
    kind,
    pass,
    outcome,
    top3,
    topScore: score,
    ...(pass ? {} : { reason: !hit ? `expected ${q.expect} in top 3` : 'gate refused a covered question' }),
  }
}

const rate = (xs: EvalOutcome[]) => (xs.length ? xs.filter((x) => x.pass).length / xs.length : 1)

export function evaluateSet(questions: EvalQuestion[]): EvalReport {
  const outcomes = questions.map(evaluateQuestion)
  const of = (k: EvalKind) => outcomes.filter((o) => o.kind === k)
  const hitAt3 = rate(of('howto'))
  const refusal = rate(of('refuse'))
  const rulesRouted = rate(of('rules'))
  return {
    outcomes,
    hitAt3,
    refusal,
    rulesRouted,
    counts: { howto: of('howto').length, refuse: of('refuse').length, rules: of('rules').length },
    pass: hitAt3 >= TARGETS.hitAt3 && refusal >= TARGETS.refusal && rulesRouted >= TARGETS.rulesRouted,
  }
}

/** Ids in the set that are not real articles (a typo would silently lower hit@3). */
export function unknownArticleIds(questions: EvalQuestion[], articleIds: ReadonlySet<string>): string[] {
  return questions.filter((q) => kindOf(q) === 'howto' && !articleIds.has(q.expect)).map((q) => `${q.id}:${q.expect}`)
}

export const pct = (x: number) => `${Math.round(x * 1000) / 10}%`
