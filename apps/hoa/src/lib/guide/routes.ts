/**
 * Route-template matching for the "?" drawer (spec §6.2) and the
 * "Take me there" button. Templates are Next app-router paths with route
 * groups stripped: `/violations/[id]`, `/docs/[...slug]`.
 */

function segments(path: string): string[] {
  const clean = path.split(/[?#]/)[0] ?? ''
  return clean.split('/').filter(Boolean)
}

type Seg = { kind: 'static'; v: string } | { kind: 'dynamic' } | { kind: 'catchall'; optional: boolean }

function parse(template: string): Seg[] {
  return segments(template).map((s): Seg => {
    if (s.startsWith('[[...')) return { kind: 'catchall', optional: true }
    if (s.startsWith('[...')) return { kind: 'catchall', optional: false }
    if (s.startsWith('[')) return { kind: 'dynamic' }
    return { kind: 'static', v: s }
  })
}

export function templateMatches(template: string, pathname: string): boolean {
  const t = parse(template)
  const p = segments(pathname)
  for (let i = 0; i < t.length; i++) {
    const seg = t[i]!
    if (seg.kind === 'catchall') return seg.optional ? p.length >= i : p.length > i
    if (i >= p.length) return false
    if (seg.kind === 'static' && seg.v !== p[i]) return false
  }
  return p.length === t.length
}

/** Higher = more specific: static segments beat dynamic beat catch-all. */
function specificity(template: string): number[] {
  return parse(template).map((s) => (s.kind === 'static' ? 3 : s.kind === 'dynamic' ? 2 : 1))
}

function compareSpecificity(a: string, b: string): number {
  const sa = specificity(a)
  const sb = specificity(b)
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const d = (sa[i] ?? 0) - (sb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

function bestExact(pathname: string, templates: readonly string[]): string | null {
  let best: string | null = null
  for (const t of templates) {
    if (templateMatches(t, pathname) && (best === null || compareSpecificity(t, best) > 0)) best = t
  }
  return best
}

/**
 * The most specific template matching `pathname`. When none matches, the
 * nearest ancestor path that does (`/dues/ledger` -> `/dues`), but never
 * the dashboard `/`: dashboard articles are not help for every page.
 */
export function matchRouteTemplate(pathname: string, templates: readonly string[]): string | null {
  const exact = bestExact(pathname, templates)
  if (exact) return exact
  const segs = segments(pathname)
  for (let n = segs.length - 1; n >= 1; n--) {
    const hit = bestExact(`/${segs.slice(0, n).join('/')}`, templates)
    if (hit && hit !== '/') return hit
  }
  return null
}

/** "Take me there" target: a template with `[id]` links to its list page. */
export function listRouteFor(template: string): string {
  const segs = segments(template)
  const firstDynamic = segs.findIndex((s) => s.startsWith('['))
  const kept = firstDynamic === -1 ? segs : segs.slice(0, firstDynamic)
  return `/${kept.join('/')}`
}
