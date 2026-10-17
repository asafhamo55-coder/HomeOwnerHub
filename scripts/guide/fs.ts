/**
 * Filesystem helpers for the guide tooling: route templates from the app
 * directory, the per-route source hash used to flag stale screenshots,
 * and reading the guide content folder.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const PAGE_FILES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js']

function isRouteSkipped(seg: string): boolean {
  return seg.startsWith('_') || seg.startsWith('@')
}

function templateOf(segs: string[]): string {
  return `/${segs.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/')}`
}

/** Each directory holding a page file, as its route template. */
function pageDirs(appDir: string): { dir: string; template: string }[] {
  const out: { dir: string; template: string }[] = []
  const walk = (dir: string, segs: string[]) => {
    const entries = readdirSync(dir, { withFileTypes: true })
    if (entries.some((e) => e.isFile() && PAGE_FILES.includes(e.name))) out.push({ dir, template: templateOf(segs) })
    for (const e of entries) {
      if (e.isDirectory() && !isRouteSkipped(e.name) && e.name !== 'node_modules') walk(join(dir, e.name), [...segs, e.name])
    }
  }
  walk(appDir, [])
  return out
}

export function routeTemplatesFrom(appDir: string): string[] {
  return [...new Set(pageDirs(appDir).map((p) => p.template))].sort()
}

function containsPage(dir: string): boolean {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && PAGE_FILES.includes(e.name)) return true
    if (e.isDirectory() && containsPage(join(dir, e.name))) return true
  }
  return false
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isFile()) out.push(p)
    else if (e.isDirectory() && !containsPage(p)) out.push(...routeFiles(p))
  }
  return out
}

/**
 * sha1 over the route's own page directory: its files plus any non-route
 * subfolders (`_components`, helpers), but not child routes. A cheap proxy
 * for "this screen changed" (spec §5.2).
 */
export function routeSourceHash(appDir: string, template: string): string | null {
  const dirs = pageDirs(appDir).filter((p) => p.template === template)
  if (dirs.length === 0) return null
  const h = createHash('sha1')
  for (const file of dirs.flatMap((d) => routeFiles(d.dir)).sort()) {
    h.update(relative(appDir, file).split(sep).join('/'))
    h.update('\0')
    h.update(readFileSync(file))
    h.update('\0')
  }
  return h.digest('hex')
}

/** `.md` articles under the content dir; folders/files starting with `_` are not articles. */
export function readArticles(contentDir: string, repoRoot: string): { path: string; src: string }[] {
  const out: { path: string; src: string }[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) out.push({ path: relative(repoRoot, p).split(sep).join('/'), src: readFileSync(p, 'utf8') })
    }
  }
  walk(contentDir)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/** All *.ts/*.tsx under `dir`, concatenated, skipping `exclude` dirs and tests. */
export function readSourceCorpus(dir: string, exclude: string[]): string {
  const parts: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (!exclude.includes(p) && e.name !== 'node_modules') walk(p)
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) parts.push(readFileSync(p, 'utf8'))
    }
  }
  walk(dir)
  return parts.join('\n')
}

export function readIfExists(path: string): string | null {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null
}
