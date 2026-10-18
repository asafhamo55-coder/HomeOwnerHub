/**
 * `pnpm guide:check` rules (spec §5.3), as a pure function so every rule
 * is unit-tested. scripts/guide-check.ts gathers the inputs from disk.
 *
 * Fails: compile errors (schema, duplicate ids, H2 set, >7 steps, banned
 * markdown), shots missing from GUIDE_SHOTS or missing a webp, routes /
 * primary routes / internal links with no page.tsx, `[[Label]]`s that no
 * longer appear in apps/hoa/src, a GUIDE_EXPECTED_ROUTES entry with no
 * article, a `guideHref('id')` / `guide: 'id'` in app code naming no
 * article, and a stale generated module.
 * Warns (phase 1): a screenshot whose screen changed since capture, a
 * `reviewed` date older than 120 days, an unused GUIDE_SHOTS entry.
 */
import { matchRouteTemplate, templateMatches } from '../../apps/hoa/src/lib/guide/routes'
import { walkInlines, type CompiledGuide } from './compile'

export const REVIEW_MAX_AGE_DAYS = 120

export interface GuideShotInfo {
  name: string
  widths: number[]
  /** Route template the shot is taken on (for the source hash). */
  route: string
}

export interface CheckInput {
  compiled: CompiledGuide
  /** apps/hoa/src/generated/guide.ts as committed (null when missing). */
  generatedOnDisk: string | null
  /** What guide:build would write now. */
  generatedFresh: string
  /** Route templates of every page.tsx under apps/hoa/src/app (groups stripped). */
  routeTemplates: string[]
  /** All apps/hoa/src *.ts/*.tsx source (generated module excluded). */
  source: string
  shots: GuideShotInfo[]
  /** File names present in apps/hoa/public/guide/shots. */
  shotFiles: ReadonlySet<string>
  manifest: Record<string, { sourceHash: string }>
  /** Current source hash per shot name. */
  sourceHashes: Record<string, string>
  expectedRoutes: string[]
  /** YYYY-MM-DD */
  today: string
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True when `label` appears in `source` with no letter or digit glued to either end. */
export function labelInSource(label: string, source: string): boolean {
  const spellings = new Set([label])
  for (const s of [...spellings]) {
    if (s.includes("'")) for (const r of ['&apos;', '&#39;', '’', '&rsquo;']) spellings.add(s.replaceAll("'", r))
  }
  for (const s of [...spellings]) if (s.includes('&')) spellings.add(s.replaceAll('&', '&amp;'))
  return [...spellings].some((s) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(s)}(?![A-Za-z0-9])`).test(source))
}

/**
 * Guide article ids referenced from app code: `guideHref('id')` (empty
 * states) and `guide: 'id'` (setup checklist steps). Spec §6.4: a renamed
 * or deleted article must fail CI, not 404 in the app.
 */
export function guideRefsInSource(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/\bguideHref\(\s*['"`]([a-z0-9-]+)['"`]|\bguide:\s*['"`]([a-z0-9-]+)['"`]/g)) out.push((m[1] ?? m[2])!)
  return [...new Set(out)]
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function checkGuide(input: CheckInput): { errors: string[]; warnings: string[] } {
  const errors = [...input.compiled.errors]
  const warnings: string[] = []
  const templates = new Set(input.routeTemplates)
  const shotByName = new Map(input.shots.map((s) => [s.name, s]))
  const usedShots = new Set<string>()
  const labels = new Map<string, string>() // label -> first article source

  for (const a of input.compiled.articles) {
    const where = a.source
    for (const r of a.routes) if (!templates.has(r)) errors.push(`${where}: route ${r} has no page.tsx under apps/hoa/src/app`)
    if (!templates.has(a.primaryRoute)) errors.push(`${where}: primary_route ${a.primaryRoute} has no page.tsx under apps/hoa/src/app`)
    if (!a.routes.includes(a.primaryRoute)) warnings.push(`${where}: primary_route ${a.primaryRoute} is not one of its routes`)

    const shotNames = new Set(a.shots.map((s) => s.name))
    for (const s of a.sections) for (const b of s.blocks) if (b.t === 'shot') shotNames.add(b.name)
    for (const name of shotNames) {
      usedShots.add(name)
      const shot = shotByName.get(name)
      if (!shot) {
        errors.push(`${where}: screenshot ${name} is not in GUIDE_SHOTS (scripts/guide-shots.ts)`)
        continue
      }
      for (const w of shot.widths) {
        const file = `${name}--${w}.webp`
        if (!input.shotFiles.has(file)) errors.push(`${where}: missing apps/hoa/public/guide/shots/${file} (run pnpm ui:shots --guide)`)
      }
    }

    walkInlines(a, (n) => {
      if (n.t === 'ui' && !labels.has(n.label)) labels.set(n.label, where)
      if (n.t === 'link' && n.kind === 'route') {
        const path = n.href.split(/[?#]/)[0]!
        if (!input.routeTemplates.some((t) => templateMatches(t, path))) errors.push(`${where}: link to ${n.href} matches no page.tsx route`)
      }
    })

    if (daysBetween(a.reviewed, input.today) > REVIEW_MAX_AGE_DAYS) {
      warnings.push(`${where}: reviewed ${a.reviewed}, more than ${REVIEW_MAX_AGE_DAYS} days ago; re-verify against the UI`)
    }
  }

  const articleIds = new Set(input.compiled.articles.map((a) => a.id))
  for (const id of guideRefsInSource(input.source)) {
    if (!articleIds.has(id)) errors.push(`apps/hoa/src: guide article "${id}" is referenced in code (guideHref / guide:) but does not exist`)
  }

  for (const [label, where] of labels) {
    if (!labelInSource(label, input.source)) errors.push(`${where}: [[${label}]] does not appear in apps/hoa/src (the UI label changed?)`)
  }

  const indexed = Object.keys(input.compiled.routeIndex)
  for (const r of input.expectedRoutes) {
    if (!matchRouteTemplate(r, indexed)) errors.push(`GUIDE_EXPECTED_ROUTES: ${r} has no article (the "?" drawer would be empty there)`)
  }

  if (input.generatedOnDisk === null) errors.push('apps/hoa/src/generated/guide.ts is missing; run pnpm guide:build')
  else if (input.generatedOnDisk !== input.generatedFresh) errors.push('apps/hoa/src/generated/guide.ts is stale; run pnpm guide:build and commit it')

  for (const shot of input.shots) {
    if (!usedShots.has(shot.name)) warnings.push(`GUIDE_SHOTS: ${shot.name} is not used by any article`)
    const recorded = input.manifest[shot.name]
    const current = input.sourceHashes[shot.name]
    if (!recorded) warnings.push(`${shot.name}: not in manifest.json (run pnpm ui:shots --guide)`)
    else if (current && recorded.sourceHash !== current) {
      warnings.push(`${shot.name}: the ${shot.route} screen changed since this screenshot was taken; re-run pnpm ui:shots --guide --only=${shot.name}`)
    }
  }

  return { errors, warnings }
}
