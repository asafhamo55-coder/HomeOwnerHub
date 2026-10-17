export const meta = {
  name: 'fix-routes',
  description: 'Fix every PROBLEMS.md issue by bringing each route handler into line, in parallel, with adversarial verification',
  whenToUse: 'Stage 2 of the api-audit-fix skill, after PROBLEMS.md exists',
  phases: [
    { title: 'Plan', detail: 'map PROBLEMS.md entries onto route files' },
    { title: 'Foundation', detail: 'shared helpers the routes converge on' },
    { title: 'Fix', detail: 'one agent per route file' },
    { title: 'Verify', detail: '3 skeptics per file try to refute the fix' },
    { title: 'Repair', detail: 'one repair round for refuted fixes' },
    { title: 'Test', detail: 'full suite once, after every file' },
  ],
}

const A = args || {}
if (!A.repo || !A.problems || !A.conventions) throw new Error('args needs repo, problems, conventions (see SKILL.md)')
const routesDir = A.routesDir || 'src/routes'
const testCommand = A.testCommand || 'npm test'
const ctx = `Repo root: ${A.repo}. Route handlers live in ${routesDir}/. Problems list: ${A.problems}. ` +
  `Conventions: ${A.conventions}, refined by the "Route conventions (this repo)" section of the problems list, which wins where they differ.`

const PLAN = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'object', properties: {
      file: { type: 'string' },
      problems: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } }, required: ['id', 'title'] } },
    }, required: ['file', 'problems'] } },
    shared: { type: 'array', items: { type: 'string' }, description: 'problem ids needing a shared helper (error envelope, validation, pagination) outside the routes dir' },
    outside: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'title', 'reason'] } },
  },
  required: ['files', 'shared', 'outside'],
}
const FIX = {
  type: 'object',
  properties: {
    changed: { type: 'array', items: { type: 'string' } },
    resolved: { type: 'array', items: { type: 'string' } },
    unresolved: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } },
    summary: { type: 'string' },
  },
  required: ['changed', 'resolved', 'unresolved', 'summary'],
}
const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'each concrete defect with path:line; empty when not refuted' },
  },
  required: ['refuted', 'reasons'],
}

// ── Plan ─────────────────────────────────────────────────────────────
phase('Plan')
const plan = await agent(
  `${ctx}\nRead the problems list and the route files. Map every open problem to the route file(s) under ${routesDir}/ it must be fixed in. ` +
  `Include EVERY route file${A.routeFiles ? ` (${A.routeFiles.join(', ')})` : ''}, even with no problems: each is still brought into line with the conventions. ` +
  `Put a problem in "shared" when the fix needs a shared helper (error envelope, validation, pagination) that does not exist yet. ` +
  `Put problems that can't be fixed in a route file (test-suite flakiness, store internals, docs) in "outside" with the reason. Do not edit anything.`,
  { label: 'plan', schema: PLAN, effort: 'low' })
if (!plan) throw new Error('planning agent returned nothing')
log(`${plan.files.length} route files, ${plan.files.reduce((n, f) => n + f.problems.length, 0)} problem assignments, ${plan.outside.length} outside the routes dir`)

// ── Foundation (sequential: every fixer depends on it) ───────────────
let foundation = 'No shared helpers were needed.'
if (plan.shared.length) {
  phase('Foundation')
  foundation = await agent(
    `${ctx}\nBefore route files are fixed in parallel, create or update the shared helpers these problems need: ${plan.shared.join(', ')}. ` +
    `Reuse what exists; add the minimum (e.g. one error-envelope helper/middleware, one validation helper, one pagination helper) that matches the conventions exactly. ` +
    `Do NOT edit any file under ${routesDir}/. Return the helper paths, their exported names and signatures, and one usage example each.`,
    { label: 'foundation' }) || foundation
}

// ── Fix → Verify → (Repair → Verify) per file, no barrier ────────────
const LENSES = [
  ['conventions', 'Does the file now meet EVERY rule in the conventions (envelope, validation before side effects, pagination params/defaults/caps/shape, response shapes, no store mutation)? Find one rule it still breaks.'],
  ['problems', 'Is EACH assigned problem actually resolved in the code (not just claimed)? Re-check the original evidence against the new code.'],
  ['regressions', 'Did the change break anything: routes/verbs/success payloads changed without a problem requiring it, files changed beyond this one (git diff), type errors, tests covering this file failing? Run the type check and this file\'s tests.'],
]

function verify(file, problems, fix, round) {
  return parallel(LENSES.map(([lens, ask]) => () => agent(
    `${ctx}\nAdversarially verify the fix to ${file} (round ${round}). You are a skeptic: try to REFUTE it. Lens: ${lens}. ${ask}\n` +
    `Assigned problems: ${JSON.stringify(problems)}\nFixer's claim: ${JSON.stringify(fix)}\n` +
    `Read the conventions file and the problems list yourself; inspect the code and \`git diff -- ${file}\`. Do not edit anything. ` +
    `Default to refuted=true if you cannot confirm it. Each reason must cite path:line.`,
    { label: `verify:${lens}:${file}`, phase: round === 1 ? 'Verify' : 'Repair', schema: VERDICT })))
    .then(vs => {
      const got = vs.filter(Boolean)
      const refutes = got.filter(v => v.refuted)
      return { passed: got.length >= 2 && got.length - refutes.length >= 2, reasons: refutes.flatMap(v => v.reasons) }
    })
}

const fixPrompt = (file, problems, extra) =>
  `${ctx}\nBring ${file} into line with the conventions and fix these problems in it: ${JSON.stringify(problems)}.\n` +
  `Shared helpers available: ${foundation}\n` +
  `Edit ONLY ${file} (and, if useful, its own test file). Other agents are editing the other route files at the same time: never touch them or shared helpers. ` +
  `Keep routes, verbs and success payloads unchanged unless a problem requires the change. ` +
  `Check your work with the type check and the tests for this file only (not the whole suite). ${extra}`

const results = await pipeline(plan.files,
  f => agent(fixPrompt(f.file, f.problems, ''), { label: `fix:${f.file}`, phase: 'Fix', schema: FIX }),
  async (fix, f) => {
    if (!fix) return { file: f.file, outcome: 'fixer failed', problems: f.problems.map(p => p.id) }
    const v1 = await verify(f.file, f.problems, fix, 1)
    if (v1.passed) return { file: f.file, outcome: 'fixed', fix }
    const repair = await agent(fixPrompt(f.file, f.problems,
      `Your earlier fix was refuted by verifiers. Address every one of these defects: ${JSON.stringify(v1.reasons)}`),
      { label: `repair:${f.file}`, phase: 'Repair', schema: FIX })
    if (!repair) return { file: f.file, outcome: 'not verified', reasons: v1.reasons, fix }
    const v2 = await verify(f.file, f.problems, repair, 2)
    return v2.passed
      ? { file: f.file, outcome: 'repaired then fixed', fix: repair, firstReasons: v1.reasons }
      : { file: f.file, outcome: 'not verified', reasons: v2.reasons, fix: repair }
  })

// ── Test once (barrier: needs every file done) ───────────────────────
phase('Test')
const tests = await agent(
  `${ctx}\nAll route files have been edited. Run \`${testCommand}\` twice and the type check once. Do not edit anything. ` +
  `Return the exact pass/fail counts per run, every failing test with its error, and which route file each failure points at.`,
  { label: 'test-suite' })

const done = results.filter(Boolean)
log(`${done.filter(r => r.outcome !== 'not verified' && r.outcome !== 'fixer failed').length}/${plan.files.length} files verified`)
return { files: done, outside: plan.outside, shared: plan.shared, foundation, tests }
