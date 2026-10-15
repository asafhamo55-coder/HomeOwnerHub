#!/usr/bin/env node
/**
 * .claude/tools/cost-agents.mjs
 *
 * Token and cost accounting for the current Claude Code session: the main
 * agent plus every subagent it spawned.
 *
 * Reads the session's own JSONL transcripts — the main conversation under
 * ~/.claude/projects/<project-slug>/<session-id>.jsonl, and each subagent's
 * transcript under the session's task directory. Every assistant message in
 * those files carries a `usage` block with the four billable quantities;
 * this sums them per agent and prices them.
 *
 * No dependencies, no network, no API calls.
 *
 * Usage:
 *   node .claude/tools/cost-agents.mjs [--ttl=1h|5m] [--json] [--session=<id>]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, basename } from 'node:path'

// ─── Pricing, $ per million tokens ───────────────────────────────────────
//
// Input and output are list rates. Cache read is 0.1x input. Cache WRITE
// depends on the cache TTL: 1.25x input for a 5-minute cache, 2x for a
// 1-hour cache. Claude Code sessions use the 1-hour TTL, so that is the
// default here — assuming 5m would understate a cache-heavy session's cost
// by nearly half, and cache writes are often the largest single line.
const BASE = {
  'claude-opus-5':    { in: 5,  out: 25 },
  'claude-fable-5':   { in: 10, out: 50 },
  'claude-sonnet-5':  { in: 3,  out: 15 },
  'claude-haiku-4-5': { in: 1,  out: 5  },
}

// Claude Code records the model as the bare tier name when a subagent was
// dispatched with a `model:` override, and as the full id for the main loop.
const ALIAS = {
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
  haiku: 'claude-haiku-4-5',
  fable: 'claude-fable-5',
  'claude-opus-5[1m]': 'claude-opus-5',
}

function price(modelId, ttl) {
  const id = ALIAS[modelId] ?? modelId
  const b = BASE[id]
  if (!b) return null                      // unknown model — never guess a rate
  return {
    id,
    in: b.in,
    out: b.out,
    cacheWrite: b.in * (ttl === '5m' ? 1.25 : 2),
    cacheRead: b.in * 0.1,
  }
}

// ─── Locate this session's transcripts ───────────────────────────────────
const args = process.argv.slice(2)
const flag = (n, d) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const TTL = flag('ttl', '1h')
const AS_JSON = args.includes('--json')

const cwd = process.cwd()
const slug = cwd.replace(/\//g, '-')
const projectDir = resolve(homedir(), '.claude/projects', slug)

function newestSession() {
  if (!existsSync(projectDir)) return null
  const files = readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, m: statSync(resolve(projectDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  return files.length ? basename(files[0].f, '.jsonl') : null
}

const sessionId = flag('session', newestSession())
if (!sessionId) {
  console.error(`cost-agents: no session transcript found under ${projectDir}`)
  process.exit(1)
}
const mainFile = resolve(projectDir, `${sessionId}.jsonl`)

// Subagent transcripts live beside the main one, under the OS temp root that
// Claude Code allocates per session. Find it by session id rather than
// hardcoding the uid-prefixed path.
function findTaskDir() {
  const roots = ['/private/tmp', '/tmp']
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const d of readdirSync(root)) {
      if (!d.startsWith('claude-')) continue
      const p = resolve(root, d, slug, sessionId, 'tasks')
      if (existsSync(p)) return p
    }
  }
  return null
}
const taskDir = findTaskDir()

// ─── Aggregate one transcript ────────────────────────────────────────────
function aggregate(file) {
  const t = {
    turns: 0, in: 0, out: 0, thinking: 0, cacheWrite: 0, cacheRead: 0,
    cost: 0, models: new Map(), unpriced: new Set(), lastTs: 0,
  }
  let text
  try { text = readFileSync(file, 'utf8') } catch { return t }

  for (const line of text.split('\n')) {
    // Cheap pre-filter: most lines are user turns or tool results.
    if (!line.includes('"usage"')) continue
    let rec
    try { rec = JSON.parse(line) } catch { continue }
    const msg = rec?.message
    const u = msg?.usage
    if (!u || typeof u !== 'object') continue

    const modelId = msg.model ?? 'claude-opus-5'
    const p = price(modelId, TTL)
    if (!p) t.unpriced.add(modelId)

    const inTok = u.input_tokens || 0
    const outTok = u.output_tokens || 0
    const cw = u.cache_creation_input_tokens || 0
    const cr = u.cache_read_input_tokens || 0

    t.turns++
    t.in += inTok
    t.out += outTok
    t.thinking += u.output_tokens_details?.thinking_tokens || 0
    t.cacheWrite += cw
    t.cacheRead += cr
    if (rec.timestamp) t.lastTs = Math.max(t.lastTs, Date.parse(rec.timestamp) || 0)

    if (p) {
      const c =
        (inTok * p.in + outTok * p.out + cw * p.cacheWrite + cr * p.cacheRead) / 1e6
      t.cost += c
      const m = t.models.get(p.id) ?? { cost: 0, turns: 0 }
      m.cost += c
      m.turns++
      t.models.set(p.id, m)
    }
  }
  return t
}

// ─── Map subagent ids to the labels they were dispatched with ────────────
//
// The main transcript holds both halves: the Agent tool_use carries the
// human description and any model override, and its tool_result echoes the
// assigned agentId. Join them on tool_use_id so the table reads in English
// rather than in hashes.
function agentLabels() {
  const byToolUse = new Map()
  const labels = new Map()
  let text
  try { text = readFileSync(mainFile, 'utf8') } catch { return labels }

  for (const line of text.split('\n')) {
    if (!line.includes('"Agent"') && !line.includes('agentId')) continue
    let rec
    try { rec = JSON.parse(line) } catch { continue }
    for (const b of rec?.message?.content ?? []) {
      if (b.type === 'tool_use' && b.name === 'Agent') {
        byToolUse.set(b.id, {
          desc: b.input?.description ?? '(no description)',
          model: b.input?.model ?? null,
          type: b.input?.subagent_type ?? null,
        })
      }
      if (b.type === 'tool_result' && byToolUse.has(b.tool_use_id)) {
        const blob = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
        const m = blob.match(/agentId:\s*([a-f0-9]{8,})/)
        if (m) labels.set(m[1], byToolUse.get(b.tool_use_id))
      }
    }
  }
  return labels
}

// ─── Collect ─────────────────────────────────────────────────────────────
const labels = agentLabels()
const rows = [{ id: 'main', label: 'main', t: aggregate(mainFile), isMain: true }]

if (taskDir) {
  for (const f of readdirSync(taskDir)) {
    if (!f.endsWith('.output')) continue
    const id = basename(f, '.output')
    const t = aggregate(resolve(taskDir, f))
    if (!t.turns) continue                 // background shell jobs, not agents
    const meta = labels.get(id)
    rows.push({ id, label: meta?.desc ?? id.slice(0, 9), t, meta })
  }
}

const total = rows.reduce((s, r) => s + r.t.cost, 0)
const byModel = new Map()
for (const r of rows) {
  for (const [m, v] of r.t.models) {
    const cur = byModel.get(m) ?? 0
    byModel.set(m, cur + v.cost)
  }
}
// Bucket totals are priced with each row's own model rate, so they are
// accumulated per row rather than from a global token sum.
const bucket = { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 }
for (const r of rows) {
  // Attribute by the row's dominant model (a row is single-model in practice).
  const dom = [...r.t.models.entries()].sort((a, b) => b[1].cost - a[1].cost)[0]?.[0]
  const p = dom ? price(dom, TTL) : null
  if (!p) continue
  bucket.in += (r.t.in * p.in) / 1e6
  bucket.out += (r.t.out * p.out) / 1e6
  bucket.cacheWrite += (r.t.cacheWrite * p.cacheWrite) / 1e6
  bucket.cacheRead += (r.t.cacheRead * p.cacheRead) / 1e6
}

if (AS_JSON) {
  console.log(JSON.stringify({ sessionId, ttl: TTL, total, rows: rows.map((r) => ({
    id: r.id, label: r.label, ...r.t,
    models: [...r.t.models.keys()], unpriced: [...r.t.unpriced],
  })), byModel: [...byModel], bucket }, null, 2))
  process.exit(0)
}

// ─── Render ──────────────────────────────────────────────────────────────
const k = (n) =>
  n >= 1e9 ? (n / 1e9).toFixed(1) + 'B'
  : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? Math.round(n / 1e3) + 'k'
  : String(n)
const usd = (n) => '$' + n.toFixed(2)
const pct = (n) => (total ? Math.round((n / total) * 100) : 0) + '%'

// A row whose last message is recent is probably still live. This is a
// heuristic on transcript mtime, not a status the transcript records.
const FRESH_MS = 90_000
const now = Date.now()

rows.sort((a, b) => b.t.cost - a.t.cost)

const W = 26
console.log()
console.log(`  session ${sessionId.slice(0, 8)}   cache TTL ${TTL}   ${rows.length} agents`)
console.log()
console.log(
  '  ' + 'agent'.padEnd(W) + 'model'.padEnd(10) +
  'turns'.padStart(6) + 'out'.padStart(8) + 'cache-w'.padStart(9) +
  'cache-r'.padStart(9) + 'cost'.padStart(9) + '  share',
)
console.log('  ' + '─'.repeat(W + 10 + 6 + 8 + 9 + 9 + 9 + 8))

for (const r of rows) {
  const dom = [...r.t.models.entries()].sort((a, b) => b[1].cost - a[1].cost)[0]?.[0] ?? '?'
  const short = dom.replace('claude-', '').replace('-4-5', '-4.5')
  const live = r.t.lastTs && now - r.t.lastTs < FRESH_MS ? '*' : ' '
  let label = r.label
  if (label.length > W - 3) label = label.slice(0, W - 4) + '…'
  console.log(
    '  ' + (live + label).padEnd(W) + short.padEnd(10) +
    String(r.t.turns).padStart(6) + k(r.t.out).padStart(8) +
    k(r.t.cacheWrite).padStart(9) + k(r.t.cacheRead).padStart(9) +
    usd(r.t.cost).padStart(9) + pct(r.t.cost).padStart(7),
  )
}

console.log('  ' + '─'.repeat(W + 10 + 6 + 8 + 9 + 9 + 9 + 8))
console.log('  ' + 'TOTAL'.padEnd(W + 10 + 6 + 8 + 9 + 9) + usd(total).padStart(9))
console.log()

console.log('  by model')
for (const [m, c] of [...byModel].sort((a, b) => b[1] - a[1]))
  console.log(`    ${m.replace('claude-', '').padEnd(14)} ${usd(c).padStart(9)}  ${pct(c)}`)
console.log()

console.log('  by token bucket')
const buckets = [
  ['cache read', bucket.cacheRead, rows.reduce((s, r) => s + r.t.cacheRead, 0)],
  ['cache write', bucket.cacheWrite, rows.reduce((s, r) => s + r.t.cacheWrite, 0)],
  ['output', bucket.out, rows.reduce((s, r) => s + r.t.out, 0)],
  ['input (uncached)', bucket.in, rows.reduce((s, r) => s + r.t.in, 0)],
].sort((a, b) => b[1] - a[1])
for (const [n, c, toks] of buckets)
  console.log(`    ${n.padEnd(18)} ${usd(c).padStart(9)}  ${pct(c).padStart(4)}   ${k(toks)} tok`)
console.log()

const unpriced = new Set(rows.flatMap((r) => [...r.t.unpriced]))
if (unpriced.size) {
  console.log(`  ! unpriced models excluded from cost: ${[...unpriced].join(', ')}`)
  console.log()
}
if (!taskDir) {
  console.log('  ! subagent task directory not found — main agent only')
  console.log()
}
console.log('  * = active in the last 90s (mtime heuristic, not a recorded status)')
console.log()
