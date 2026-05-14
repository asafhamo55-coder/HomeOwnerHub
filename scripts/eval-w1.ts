/**
 * scripts/eval-w1.ts
 *
 * The W1 (Governing Docs Brain) gate runner. Spec §21:
 *   "If governing-doc citation accuracy isn't ≥ 90% by end of week 2,
 *    every downstream workflow degrades."
 *
 * Loops EVAL_CASES (defined in packages/workflows/src/W1-governing-docs-brain/eval.ts)
 * through governingDocsBrain.execute(), grades each case against the
 * substring / citation / confidence assertions, and reports pass rate.
 *
 * Run from repo root with pnpm exec so the workspace resolves
 * @supabase/supabase-js (plain `npx tsx` fails on module resolution):
 *
 *   AI_BASE_URL=https://api.groq.com/openai/v1 \
 *   AI_API_KEY=gsk_... \
 *   AI_MODEL=llama-3.3-70b-versatile \
 *   NEXT_PUBLIC_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   HUGGINGFACE_API_TOKEN=hf_... \
 *   pnpm exec tsx scripts/eval-w1.ts
 *
 * Optional env:
 *   EVAL_ORG_NAME — pick a specific HOA org (defaults to first HOA org)
 *   EVAL_VERBOSE=1 — print full answer + citations for every case (not just failures)
 *   EVAL_REQUIRE_GATE=1 — fail with exit 1 unless ≥ W1_GATE_MIN_CASES are loaded
 *                       AND pass rate ≥ W1_GATE_PASS_RATE. Without this, the
 *                       script reports a "smoke" run that always exits 0 unless
 *                       the workflow itself crashed.
 *
 * Pre-req: scripts/seed-sample-ccr.ts must have run for the target org so
 * there's at least one governing_documents row + chunks. The runner will
 * abort early with a clear message if no chunks exist.
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { governingDocsBrain } from '../packages/workflows/src/W1-governing-docs-brain'
import {
  EVAL_CASES,
  W1_GATE_MIN_CASES,
  W1_GATE_PASS_RATE,
  confidenceAtLeast,
  type CaseResult,
  type Confidence,
  type EvalCase,
  type SuiteResult,
} from '../packages/workflows/src/W1-governing-docs-brain/eval'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const REQUIRE_GATE = process.env.EVAL_REQUIRE_GATE === '1'
const VERBOSE = process.env.EVAL_VERBOSE === '1'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[eval-w1] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!process.env.AI_BASE_URL || !process.env.AI_API_KEY) {
  console.error('[eval-w1] Missing AI_BASE_URL or AI_API_KEY (the W1 LLM endpoint)')
  process.exit(1)
}

async function main(): Promise<void> {
  const db = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ─── Resolve target org + association ─────────────────────────────
  const targetOrgName = process.env.EVAL_ORG_NAME
  const { data: orgs, error: orgErr } = (await db
    .from('orgs')
    .select('id, name, hub_type')
    .eq('hub_type', 'hoa')
    .order('created_at', { ascending: true })) as unknown as {
      data: { id: string; name: string; hub_type: string }[] | null
      error: { message: string } | null
    }

  if (orgErr || !orgs || orgs.length === 0) {
    console.error('[eval-w1] No HOA orgs found.', orgErr?.message)
    process.exit(1)
  }

  const targetOrg = targetOrgName
    ? orgs.find((o) => o.name === targetOrgName)
    : orgs[0]
  if (!targetOrg) {
    console.error(
      `[eval-w1] No HOA org matching name="${targetOrgName}". Available:`,
      orgs.map((o) => o.name),
    )
    process.exit(1)
  }

  const { data: assocs } = await db
    .from('associations' as never)
    .select('id, name')
    .eq('organization_id' as never, targetOrg.id)
    .limit(1)
  const association = (assocs as { id: string; name: string }[] | null)?.[0]
  if (!association) {
    console.error(
      `[eval-w1] Org "${targetOrg.name}" has no association. Run seed-sample-ccr.ts first.`,
    )
    process.exit(1)
  }

  // ─── Verify the org has governing-doc chunks loaded ───────────────
  const { count: chunkCount, error: chunkErr } = await db
    .from('governing_document_chunks' as never)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id' as never, targetOrg.id)
  if (chunkErr) {
    console.error('[eval-w1] Failed to count chunks:', chunkErr.message)
    process.exit(1)
  }
  if (!chunkCount || chunkCount === 0) {
    console.error(
      `[eval-w1] Org "${targetOrg.name}" has zero governing_document_chunks. ` +
        'Run scripts/seed-sample-ccr.ts (or the upload UI) before running the eval.',
    )
    process.exit(1)
  }

  console.log(
    `[eval-w1] Org=${targetOrg.name} (${targetOrg.id}) — ${chunkCount} chunks loaded`,
  )
  console.log(
    `[eval-w1] Running ${EVAL_CASES.length} cases (gate threshold: ${W1_GATE_MIN_CASES} cases at ≥ ${(W1_GATE_PASS_RATE * 100).toFixed(0)}%)`,
  )
  console.log('')

  // ─── Run each case ────────────────────────────────────────────────
  const results: CaseResult[] = []
  for (const c of EVAL_CASES) {
    const result = await runCase(c, targetOrg.id, association.id)
    results.push(result)
    printCaseLine(result)
    if (VERBOSE || !result.passed) printCaseDetail(result)
  }

  // ─── Summarize ────────────────────────────────────────────────────
  const summary = summarize(results)
  printSummary(summary)

  // ─── Exit code ────────────────────────────────────────────────────
  if (REQUIRE_GATE) {
    if (summary.gatePassed) {
      console.log('\n[eval-w1] ✅ Gate passed.')
      process.exit(0)
    } else {
      console.error(
        `\n[eval-w1] ❌ Gate failed: need ≥ ${W1_GATE_MIN_CASES} cases at ≥ ${(W1_GATE_PASS_RATE * 100).toFixed(0)}% pass rate.`,
      )
      process.exit(1)
    }
  }
  console.log(
    '\n[eval-w1] (smoke run — set EVAL_REQUIRE_GATE=1 to enforce the gate exit code)',
  )
}

async function runCase(
  c: EvalCase,
  organizationId: string,
  associationId: string,
): Promise<CaseResult> {
  const startedAt = Date.now()
  try {
    const { output, latencyMs } = await governingDocsBrain.execute(
      { question: c.question, associationId },
      { organizationId, correlationId: `eval-w1:${c.id}` },
    )

    const reasons: string[] = []

    // 1. Answer substrings
    const ansLower = output.answer.toLowerCase()
    for (const needle of c.expectedAnswerContains) {
      if (!ansLower.includes(needle.toLowerCase())) {
        reasons.push(`answer missing required substring "${needle}"`)
      }
    }
    for (const forbidden of c.expectedAnswerExcludes ?? []) {
      if (ansLower.includes(forbidden.toLowerCase())) {
        reasons.push(`answer contains forbidden substring "${forbidden}"`)
      }
    }

    // 2. Confidence floor
    if (!confidenceAtLeast(output.confidence, c.expectedMinConfidence)) {
      reasons.push(
        `confidence ${output.confidence} below floor ${c.expectedMinConfidence}`,
      )
    }

    // 3. Citation doc_type — at least one returned citation must match
    if (c.expectedCitationDocTypes.length > 0) {
      const expectedTypes = new Set(c.expectedCitationDocTypes.map((t) => t.toLowerCase()))
      const returnedTypes = output.citations.map((c) => c.docType.toLowerCase())
      if (!returnedTypes.some((t) => expectedTypes.has(t))) {
        reasons.push(
          `no citation matched expected doc_types ${JSON.stringify([...expectedTypes])} (got ${JSON.stringify(returnedTypes)})`,
        )
      }
    }

    // 4. Citation section (optional, tighter check)
    if (c.expectedCitationSections && c.expectedCitationSections.length > 0) {
      const expectedSections = c.expectedCitationSections.map((s) => s.toLowerCase())
      const returnedSections = output.citations
        .map((c) => c.section?.toLowerCase() ?? '')
        .filter(Boolean)
      const matched = expectedSections.some((expected) =>
        returnedSections.some((returned) => returned.includes(expected)),
      )
      if (!matched) {
        reasons.push(
          `no citation section matched expected ${JSON.stringify(expectedSections)} (got ${JSON.stringify(returnedSections)})`,
        )
      }
    }

    // 5. Escalation case — confidence MUST be LOW + citations should be empty
    if (c.expectsEscalation) {
      if (output.confidence !== 'LOW') {
        reasons.push(
          `expected escalation (LOW confidence), got ${output.confidence}`,
        )
      }
      if (output.citations.length > 0) {
        reasons.push(
          `escalation case returned ${output.citations.length} citation(s); expected 0`,
        )
      }
    }

    return {
      caseId: c.id,
      passed: reasons.length === 0,
      reasons,
      question: c.question,
      answer: output.answer,
      confidence: output.confidence as Confidence,
      citations: output.citations.map((cit) => ({
        docType: cit.docType,
        section: cit.section,
      })),
      latencyMs,
    }
  } catch (err) {
    return {
      caseId: c.id,
      passed: false,
      reasons: [`workflow threw: ${err instanceof Error ? err.message : String(err)}`],
      question: c.question,
      answer: '',
      confidence: 'LOW',
      citations: [],
      latencyMs: Date.now() - startedAt,
    }
  }
}

function summarize(results: CaseResult[]): SuiteResult {
  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const passRate = total === 0 ? 0 : passed / total

  // Citation accuracy: of cases that expected citations, how many got at
  // least one matching citation? Computed by checking that none of their
  // failure reasons start with "no citation".
  const casesExpectingCitations = results.filter((r) => r.citations.length >= 0)
  const citationOk = casesExpectingCitations.filter(
    (r) => !r.reasons.some((reason) => reason.startsWith('no citation')),
  ).length
  const citationAccuracy =
    casesExpectingCitations.length === 0
      ? 0
      : citationOk / casesExpectingCitations.length

  const confidenceOk = results.filter(
    (r) => !r.reasons.some((reason) => reason.startsWith('confidence ')),
  ).length
  const confidenceAccuracy = total === 0 ? 0 : confidenceOk / total

  const gatePassed = total >= W1_GATE_MIN_CASES && passRate >= W1_GATE_PASS_RATE

  return {
    total,
    passed,
    passRate,
    citationAccuracy,
    confidenceAccuracy,
    results,
    gatePassed,
    ranAt: new Date().toISOString(),
  }
}

function printCaseLine(r: CaseResult): void {
  const mark = r.passed ? '✅' : '❌'
  const idCol = r.caseId.padEnd(36, ' ').slice(0, 36)
  const latencyCol = `${r.latencyMs}ms`.padStart(8, ' ')
  const conf = `[${r.confidence}]`.padStart(8, ' ')
  console.log(`${mark} ${idCol} ${conf} ${latencyCol}`)
}

function printCaseDetail(r: CaseResult): void {
  console.log(`     Q: ${r.question}`)
  if (r.answer) {
    const ansSnippet =
      r.answer.length > 200 ? r.answer.slice(0, 200) + '…' : r.answer
    console.log(`     A: ${ansSnippet}`)
  }
  if (r.citations.length > 0) {
    console.log(
      `     citations: ${r.citations
        .map((c) => `${c.docType}${c.section ? ` §${c.section}` : ''}`)
        .join(', ')}`,
    )
  } else {
    console.log('     citations: (none)')
  }
  for (const reason of r.reasons) {
    console.log(`     ⚠  ${reason}`)
  }
  console.log('')
}

function printSummary(s: SuiteResult): void {
  console.log('')
  console.log('─'.repeat(72))
  console.log(`Pass rate:           ${pct(s.passRate)} (${s.passed}/${s.total})`)
  console.log(`Citation accuracy:   ${pct(s.citationAccuracy)}`)
  console.log(`Confidence accuracy: ${pct(s.confidenceAccuracy)}`)
  console.log('─'.repeat(72))
  if (s.total < W1_GATE_MIN_CASES) {
    console.log(
      `⚠  Only ${s.total} cases loaded — gate requires ≥ ${W1_GATE_MIN_CASES}. ` +
        'Add Madison Park questions to EVAL_CASES.',
    )
  }
  if (s.passRate < W1_GATE_PASS_RATE) {
    console.log(
      `⚠  Pass rate ${pct(s.passRate)} below gate threshold ${pct(W1_GATE_PASS_RATE)}.`,
    )
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

main().catch((err) => {
  console.error('[eval-w1] crashed:', err)
  process.exit(1)
})
