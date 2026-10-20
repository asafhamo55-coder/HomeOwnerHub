import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Server-action gate ratchet (security sweep, 2026-10-20).
 *
 * Every export of a 'use server' module is a public POST endpoint: a
 * resident (or anyone with a session) can call it with any arguments. RLS
 * protects the caller's own client, but the service role
 * (createAdminClient) and the AI workflows (which read and write with it)
 * bypass RLS entirely. H-1/H-2 were exactly this: board-only actions that
 * reached W23/W21 with a client-supplied id and no role gate.
 *
 * This scans source text. An exported async function in a 'use server'
 * file FAILS when it can reach privileged code — `createAdminClient(`, a
 * value imported from @homeowner-portal/workflows or /jobs being called, or
 * a local function (same file or imported, followed transitively) that
 * does — without first calling a role gate:
 *   requireBoardOrAdminForAction, requireBoardOrAdmin, requireAdmin,
 *   requireResident, requirePlatformAdmin, requireRoute*,
 *   getCurrentUserRole, getCurrentUserRoleInOrg, isPlatformAdmin,
 *   getImpersonationTarget / getResidentActor (admin-verified
 *   impersonation, else the caller's own RLS client) —
 * or a local helper whose body starts with one of those (gateAndLoad,
 * planContext, signedInResident, …). chargeAiActionQuota is never
 * credited as a gate.
 * "First" is textual: the gate call must appear before the first
 * privileged call in the function body.
 *
 * Crude by design (no type information, no control flow): it stops the
 * specific pattern that shipped. An action that is legitimately public
 * (a signed token is its authorization, or it only ever touches the
 * caller's own row) goes in ALLOWLIST with the reason. The allowlist can
 * only shrink: an entry that no longer offends fails too.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = here // apps/hoa/src

/** "<file relative to apps/hoa/src>#<export>" → why it is allowed. */
const ALLOWLIST: Record<string, string> = {
  'app/onboarding/actions.ts#createHoaOrg':
    'signed-in user with no org yet creates their own org + admin membership; there is no membership for RLS to check, so the service role is the only path. Requires auth.getUser().',
  'lib/rfp-invitations.ts#validateRfpInvitationToken':
    'public vendor bid link: the 32-byte random unique_submission_token IS the authorization; it reads only the one invitation the token names.',
  'lib/vendor-invitations.ts#validateInvitationToken':
    'public vendor onboarding link: the random invitation token IS the authorization; it reads only the one invitation the token names.',
}

const GATE =
  /\b(?:requireBoardOrAdminForAction|requireBoardOrAdmin|requireAdmin|requireResident|requirePlatformAdmin|requireRoute\w+|getCurrentUserRole|getCurrentUserRoleInOrg|isPlatformAdmin|getImpersonationTarget|getResidentActor)\s*\(/

const NOT_A_GATE = new Set(['chargeAiActionQuota'])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full)
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

function isUseServer(src: string): boolean {
  return /^\s*['"]use server['"]/.test(stripComments(src))
}

interface Fn {
  name: string
  exported: boolean
  body: string
}

/** Top-level functions (declarations and `const x = async (…) =>`). */
function topLevelFns(code: string): Fn[] {
  const starts: Array<{ idx: number; name: string; exported: boolean }> = []
  const decl =
    /^(export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)|^(export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\b)/gm
  for (const m of code.matchAll(decl)) {
    starts.push({ idx: m.index!, name: (m[2] ?? m[4])!, exported: Boolean(m[1] ?? m[3]) })
  }
  // Any other column-0 statement ends the previous function's body.
  const boundaries = [...code.matchAll(/^(?:export|function|async|const|let|var|type|interface|class|import)\b/gm)].map(
    (m) => m.index!,
  )
  return starts.map((s) => {
    const end = boundaries.find((b) => b > s.idx) ?? code.length
    return { name: s.name, exported: s.exported, body: code.slice(s.idx, end) }
  })
}

interface Mod {
  rel: string
  useServer: boolean
  fns: Map<string, Fn>
  /** local name → { module file (abs) | 'pkg:<name>', imported name } */
  imports: Map<string, { from: string; name: string }>
}

const modCache = new Map<string, Mod | null>()

function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(srcRoot, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand
  }
  return null
}

function loadMod(file: string): Mod | null {
  if (modCache.has(file)) return modCache.get(file)!
  modCache.set(file, null) // cycle guard
  const raw = readFileSync(file, 'utf8')
  const code = stripComments(raw)
  const fns = new Map<string, Fn>()
  for (const f of topLevelFns(code)) fns.set(f.name, f)
  const imports = new Map<string, { from: string; name: string }>()
  for (const m of code.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[2]!
    let from: string | null = null
    if (/^@homeowner-portal\/(?:workflows|jobs)$/.test(spec)) from = `pkg:${spec}`
    else from = resolveLocal(spec, file)
    if (!from) continue
    for (const part of m[1]!.split(',')) {
      const p = part.trim()
      if (!p || p.startsWith('type ')) continue
      const [orig, local] = p.split(/\s+as\s+/).map((x) => x.trim())
      imports.set(local ?? orig!, { from, name: orig! })
    }
  }
  const mod: Mod = { rel: path.relative(srcRoot, file).split(path.sep).join('/'), useServer: isUseServer(raw), fns, imports }
  modCache.set(file, mod)
  return mod
}

const reachCache = new Map<string, boolean>()

/**
 * Index of the first privileged call in `fn` that is not preceded by a
 * gate, or -1. A callee that is itself gated (or not privileged) does not
 * count.
 */
function firstUngatedPrivileged(mod: Mod, fn: Fn, stack: Set<string>): number {
  const body = fn.body
  const hits: number[] = []
  const gates: number[] = []
  for (const m of body.matchAll(new RegExp(GATE.source, "g"))) gates.push(m.index!)
  for (const m of body.matchAll(/\bcreateAdminClient\s*\(/g)) hits.push(m.index!)
  for (const m of body.matchAll(/\b(\w+)\s*(?:\.\s*execute\s*)?\(/g)) {
    const id = m[1]!
    if (id === fn.name) continue
    const imp = mod.imports.get(id)
    if (imp?.from.startsWith('pkg:')) {
      hits.push(m.index!)
      continue
    }
    let target: Mod | null = null
    let tfn: Fn | undefined
    if (imp) {
      target = loadMod(imp.from)
      tfn = target?.fns.get(imp.name)
    } else {
      target = mod
      tfn = mod.fns.get(id)
    }
    if (!target || !tfn) continue
    // A helper that itself starts with a role gate (gateAndLoad,
    // planContext, …) counts as the gate at its call site.
    if (isGateFn(tfn)) gates.push(m.index!)
    else if (reaches(target, tfn, stack)) hits.push(m.index!)
  }
  if (hits.length === 0) return -1
  const first = Math.min(...hits)
  if (gates.some((g) => g < first)) return -1
  return first
}

/** A function whose body calls a role gate before anything privileged. */
function isGateFn(fn: Fn): boolean {
  // The AI quota refuses non-board callers for board buckets (fail
  // closed), but it is a backstop, not the action's gate: the action must
  // gate — and org-own its ids — before charging. Never credit it.
  if (NOT_A_GATE.has(fn.name)) return false
  const g = GATE.exec(fn.body)
  if (!g) return false
  const admin = fn.body.search(/\bcreateAdminClient\s*\(/)
  return admin === -1 || g.index < admin
}

/** Does calling `fn` reach privileged code without passing a gate? */
function reaches(mod: Mod, fn: Fn, stack: Set<string>): boolean {
  const key = `${mod.rel}#${fn.name}`
  if (reachCache.has(key)) return reachCache.get(key)!
  if (stack.has(key)) return false
  stack.add(key)
  const r = firstUngatedPrivileged(mod, fn, stack) >= 0
  stack.delete(key)
  reachCache.set(key, r)
  return r
}

describe('server-action gate ratchet', () => {
  const files = walk(srcRoot)
  const actionMods = files.map(loadMod).filter((m): m is Mod => m !== null && m.useServer)

  it('scans a plausible number of use-server modules (the walk is not silently empty)', () => {
    expect(actionMods.length).toBeGreaterThan(50)
  })

  const offenders: string[] = []
  for (const mod of actionMods) {
    for (const fn of mod.fns.values()) {
      if (!fn.exported) continue
      if (reaches(mod, fn, new Set())) offenders.push(`${mod.rel}#${fn.name}`)
    }
  }

  it('no exported server action reaches the service role or a workflow before a role gate', () => {
    const fresh = offenders.filter((o) => !(o in ALLOWLIST))
    expect(
      fresh,
      'gate it (requireBoardOrAdminForAction / requireAdmin / …) and org-own every client-supplied id before the privileged call — or, if it is genuinely public, add it to ALLOWLIST with the reason',
    ).toEqual([])
  })

  it('allowlisted actions still offend (delete the entry once fixed)', () => {
    const stale = Object.keys(ALLOWLIST).filter((k) => !offenders.includes(k))
    expect(stale).toEqual([])
  })

  it('catches the H-1 shape (control: the analyzer is not vacuous)', () => {
    const fake: Mod = {
      rel: 'fake.ts',
      useServer: true,
      fns: new Map(),
      imports: new Map([['bidComparator', { from: 'pkg:@homeowner-portal/workflows', name: 'bidComparator' }]]),
    }
    const ungated: Fn = {
      name: 'run',
      exported: true,
      body: 'export async function run(id) { const org = await getCurrentOrg(); return bidComparator.execute({ id }) }',
    }
    const gated: Fn = {
      name: 'run2',
      exported: true,
      body: 'export async function run2(id) { const g = await requireBoardOrAdminForAction(X); return bidComparator.execute({ id }) }',
    }
    expect(firstUngatedPrivileged(fake, ungated, new Set())).toBeGreaterThan(-1)
    expect(firstUngatedPrivileged(fake, gated, new Set())).toBe(-1)
  })
})
