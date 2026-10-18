/**
 * scripts/guide-build.ts — `pnpm guide:build`
 *
 * Compiles apps/hoa/content/guide/**.md into apps/hoa/src/generated/guide.ts
 * (spec §5.1), plus the `whats_new:` blocks of docs/releases (spec §6.5). The output is committed, like a lockfile; CI regenerates it
 * and fails on any diff.
 *
 *   --check   write nothing; exit 1 if the committed file is stale
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import YAML from 'yaml'
import { compileGuide, emitModule } from './guide/compile'
import { readArticles, readIfExists, readReleaseNotes } from './guide/fs'
import { CONTENT_DIR, GENERATED_FILE, META_FILE, RELEASES_DIR, REPO_ROOT } from './guide/paths'
import { isReleaseNoteFile } from './guide/whats-new'

export function buildGuide() {
  const compiled = compileGuide(
    readArticles(CONTENT_DIR, REPO_ROOT),
    YAML.parse(readFileSync(META_FILE, 'utf8')),
    readReleaseNotes(RELEASES_DIR, isReleaseNoteFile),
  )
  return { compiled, text: emitModule(compiled) }
}

function main() {
  const { compiled, text } = buildGuide()
  if (compiled.errors.length) {
    for (const e of compiled.errors) console.error(`error: ${e}`)
    console.error(`guide:build — ${compiled.errors.length} error(s); nothing written`)
    process.exit(1)
  }
  if (process.argv.includes('--check')) {
    if (readIfExists(GENERATED_FILE) !== text) {
      console.error('guide:build --check — apps/hoa/src/generated/guide.ts is stale; run pnpm guide:build')
      process.exit(1)
    }
    console.log('guide:build --check — up to date')
    return
  }
  mkdirSync(dirname(GENERATED_FILE), { recursive: true })
  writeFileSync(GENERATED_FILE, text)
  console.log(
    `guide:build — ${compiled.articles.length} articles, ${compiled.sections.length} sections, ${Object.keys(compiled.routeIndex).length} routes, ${compiled.whatsNew.length} what's-new entries → apps/hoa/src/generated/guide.ts`,
  )
}

if (require.main === module) main()
