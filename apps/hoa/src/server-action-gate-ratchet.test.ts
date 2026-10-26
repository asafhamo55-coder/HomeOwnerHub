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
 *   getImpersonationTarget / getResidentActor (admin-verified
 *   impersonation, else the caller's own RLS client) —
 * or a role LOOKUP (getCurrentUserRole, getCurrentUserRoleInOrg,
 *   isPlatformAdmin) whose result is compared in the same function
 *   (security review #2, L6: a lookup alone refuses nobody, so
 *   `await getCurrentUserRole()` followed by the service role is an
 *   offender; `if (role !== 'admin') return …` is a gate) —
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

/** Gates that refuse by themselves (throw / redirect / return a denial). */
const GATE =
  /\b(?:requireBoardOrAdminForAction|requireProfessionalForAction|requireBoardOrAdmin|requireAdmin|requireResident|requirePlatformAdmin|requireRoute\w+|getImpersonationTarget|getResidentActor)\s*\(/

/** Role lookups: a gate only when the result is compared (roleLookupGates). */
const ROLE_LOOKUP = /\b(?:getCurrentUserRole|getCurrentUserRoleInOrg|isPlatformAdmin)\s*\(/g

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type LookupKind = 'object' | 'value' | 'boolean'

/** What each lookup returns: { role, org } | null, a role | null, or a boolean. */
const LOOKUP_KIND: Record<string, LookupKind> = {
  getCurrentUserRole: 'object',
  getCurrentUserRoleInOrg: 'value',
  isPlatformAdmin: 'boolean',
}

const CMP = '(?:===|!==|==|!=)'

/**
 * Is the lookup's result `name` tested for a ROLE somewhere in `rest`? A
 * null check alone (`if (!ctx) return`) is not enough for a role lookup:
 * a resident has a role too.
 */
function comparedLater(rest: string, name: string, kind: LookupKind): boolean {
  const n = `\\b${esc(name)}\\b`
  const role = `${n}\\s*(?:\\?\\.|\\.)\\s*role`
  const alternatives =
    kind === 'object'
      ? [`${role}\\s*${CMP}(?!\\s*(?:null|undefined)\\b)`, `${CMP}\\s*${role}`, `\\.includes\\(\\s*${role}`]
      : kind === 'value'
        ? [`${n}\\s*${CMP}(?!\\s*(?:null|undefined)\\b)`, `${CMP}\\s*${n}`, `\\.includes\\(\\s*${n}`]
        : [`!\\s*\\(?\\s*${n}`, `\\bif\\s*\\(\\s*${n}\\s*(?:\\)|&&|\\|\\|)`, `${n}\\s*${CMP}\\s*(?:true|false)`]
  return new RegExp(alternatives.join('|')).test(rest)
}

/**
 * Indices of role lookups whose result this function compares: assigned
 * (`const ctx = await getCurrentUserRole()`, `const { role } = …`) and
 * tested later, or tested inline (`if (!(await isPlatformAdmin()))`,
 * `(await getCurrentUserRole())?.role === 'admin'`).
 */
function roleLookupGates(body: string): number[] {
  const out: number[] = []
  for (const m of body.matchAll(ROLE_LOOKUP)) {
    const idx = m.index!
    const kind = LOOKUP_KIND[/^\w+/.exec(m[0])![0]]!
    const lineStart = body.lastIndexOf('\n', idx) + 1
    const before = body.slice(lineStart, idx)
    const after = body.slice(idx)
    const assigned = /(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?$/.exec(before)
    const destructured = /(?:const|let)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?$/.exec(before)
    let ok = false
    if (assigned) ok = comparedLater(after, assigned[1]!, kind)
    else if (destructured && kind === 'object') {
      // const { role } = … / const { role: r } = …
      const roleName = destructured[1]!
        .split(',')
        .map((p) => p.trim())
        .find((p) => /^role\b/.test(p))
      ok = roleName ? comparedLater(after, roleName.split(':').pop()!.trim(), 'value') : false
    } else if (!destructured) {
      const lineEnd = body.indexOf('\n', idx)
      const rest = body.slice(idx, lineEnd === -1 ? undefined : lineEnd)
      ok =
        kind === 'boolean'
          ? /(?:\bif\s*\(|!)\s*\(?\s*(?:await\s+)?$/.test(before)
          : kind === 'object'
            ? new RegExp(`^\\w+\\s*\\([^)]*\\)\\s*\\)?\\s*(?:\\?\\.|\\.)\\s*role\\s*${CMP}`).test(rest)
            : new RegExp(`^\\w+\\s*\\([^)]*\\)\\s*\\)?\\s*${CMP}`).test(rest)
    }
    if (ok) out.push(idx)
  }
  return out
}

/** Every gate in a body: self-refusing gates plus compared role lookups. */
function gateIndices(body: string): number[] {
  const out: number[] = []
  for (const m of body.matchAll(new RegExp(GATE.source, 'g'))) out.push(m.index!)
  out.push(...roleLookupGates(body))
  return out
}

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
  const gates: number[] = gateIndices(body)
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
  const gates = gateIndices(fn.body)
  if (gates.length === 0) return false
  const first = Math.min(...gates)
  const admin = fn.body.search(/\bcreateAdminClient\s*\(/)
  return admin === -1 || first < admin
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

  it('L6: a role lookup is a gate only when its result is compared (control)', () => {
    const fake: Mod = { rel: 'fake.ts', useServer: true, fns: new Map(), imports: new Map() }
    const body = (name: string, inner: string) => ({ name, exported: true, body: `export async function ${name}() {\n${inner}\n}` })
    const offends = (inner: string) => firstUngatedPrivileged(fake, body('f', inner), new Set()) > -1
    // looked up, never compared: refuses nobody
    expect(offends('  const ctx = await getCurrentUserRole()\n  return createAdminClient().from("x")')).toBe(true)
    expect(offends('  await getCurrentUserRole()\n  return createAdminClient().from("x")')).toBe(true)
    expect(offends('  const role = await getCurrentUserRoleInOrg(org.id)\n  log(role)\n  return createAdminClient()')).toBe(true)
    expect(offends('  const ctx = await getCurrentUserRole()\n  if (!ctx) return null\n  return createAdminClient()')).toBe(true)
    expect(offends('  const ctx = await getCurrentUserRole()\n  log(ctx.role)\n  return createAdminClient()')).toBe(true)
    // compared: a gate
    expect(offends("  const ctx = await getCurrentUserRole()\n  if (!ctx || ctx.role !== 'admin') return null\n  return createAdminClient()")).toBe(false)
    expect(offends("  const role = await getCurrentUserRoleInOrg(org.id)\n  if (role !== 'admin' && role !== 'board') return x\n  return createAdminClient()")).toBe(false)
    expect(offends("  const { role } = await getCurrentUserRole()\n  if (!['board', 'admin'].includes(role)) return x\n  return createAdminClient()")).toBe(false)
    expect(offends('  if (!(await isPlatformAdmin())) return x\n  return createAdminClient()')).toBe(false)
    expect(offends('  const ok = await isPlatformAdmin()\n  if (!ok) return x\n  return createAdminClient()')).toBe(false)
    expect(offends("  if ((await getCurrentUserRole())?.role !== 'admin') return x\n  return createAdminClient()")).toBe(false)
  })
})
