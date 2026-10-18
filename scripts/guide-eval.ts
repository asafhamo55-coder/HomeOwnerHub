/**
 * scripts/guide-eval.ts — `pnpm guide:eval` (spec §6.3).
 *
 * Default (CI): retrieval only. Every question in
 * apps/hoa/content/guide/_eval/questions.yaml goes through the rules
 * classifier, retrieval and the gate that /api/help/ask uses; no model is
 * called and no key is needed. Exit 1 when hit@3, refusal or rules routing
 * falls below the spec §11 bars, or the set names an unknown article.
 *
 * GUIDE_EVAL_MODEL=1 (manual, before a guide release; never CI): also sends
 * each question that passes the gate to the model through the same
 * askGuide() the route uses, and reports how many answers survived
 * validation with at least one citation. Needs AI_API_KEY.
 *
 * `--verbose` prints every question's outcome and gate score (for tuning
 * MIN_SCORE), not just the failures.
 *
 * Output is ids, kinds and numbers. Questions are fixtures, not user text,
 * but they are still not echoed: the ids are enough to find them.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import { GUIDE_ARTICLES } from '../apps/hoa/src/generated/guide'
import { EvalSetSchema, TARGETS, evaluateSet, kindOf, pct, unknownArticleIds } from './guide/eval'
import { CONTENT_DIR } from './guide/paths'

const EVAL_FILE = resolve(CONTENT_DIR, '_eval', 'questions.yaml')

async function modelRun(questions: ReturnType<typeof EvalSetSchema.parse>['questions']) {
  const { askGuide } = await import('../apps/hoa/src/lib/guide/ask')
  const { completeAskWithModel } = await import('../apps/hoa/src/lib/guide/ask-model')
  let answered = 0
  let refused = 0
  let cited = 0
  let wrong = 0
  for (const q of questions) {
    const r = await askGuide(q.q, { role: q.role, route: q.route ?? null }, completeAskWithModel)
    const kind = kindOf(q)
    if (r.kind === 'answer') {
      answered++
      if (r.citations.length > 0) cited++
      if (kind === 'refuse' || (kind === 'howto' && !r.citations.some((c) => c.articleId === q.expect))) {
        wrong++
        console.log(`  model: ${q.id} answered (${kind}) citing ${r.citations.map((c) => c.articleId).join(',')}`)
      }
    } else {
      if (r.kind !== 'rules_question') refused++
      if (kind === 'howto') console.log(`  model: ${q.id} ${r.kind} (expected an answer)`)
    }
  }
  console.log(`guide:eval model — ${answered} answered (${cited} with citations), ${refused} refused/unavailable, ${wrong} wrong`)
  return wrong === 0 && cited === answered
}

async function main() {
  const set = EvalSetSchema.parse(YAML.parse(readFileSync(EVAL_FILE, 'utf8')))
  const unknown = unknownArticleIds(set.questions, new Set(GUIDE_ARTICLES.map((a) => a.id)))
  if (unknown.length) {
    console.error(`guide:eval — unknown article ids in the eval set: ${unknown.join(', ')}`)
    process.exit(1)
  }
  const report = evaluateSet(set.questions)
  const verbose = process.argv.includes('--verbose')
  for (const o of report.outcomes) {
    if (!o.pass || verbose) console.log(`  ${o.pass ? 'ok  ' : 'fail'} ${o.id} (${o.kind}): ${o.reason ?? o.outcome}; top3=${o.top3.join(',') || '-'} score=${o.topScore}`)
  }
  console.log(
    `guide:eval retrieval — ${set.questions.length} questions: ` +
      `hit@3 ${pct(report.hitAt3)} (${report.counts.howto}, target ${pct(TARGETS.hitAt3)}), ` +
      `refusal ${pct(report.refusal)} (${report.counts.refuse}, target ${pct(TARGETS.refusal)}), ` +
      `rules→Ask the Docs ${pct(report.rulesRouted)} (${report.counts.rules}, target ${pct(TARGETS.rulesRouted)})`,
  )
  let ok = report.pass
  if (process.env.GUIDE_EVAL_MODEL === '1') ok = (await modelRun(set.questions)) && ok
  console.log(ok ? 'guide:eval — pass' : 'guide:eval — FAIL')
  if (!ok) process.exit(1)
}

void main()
