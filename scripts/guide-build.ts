/**
 * scripts/guide-build.ts — `pnpm guide:build`
 *
 * Compiles apps/hoa/content/guide/**.md into apps/hoa/src/generated/guide.ts
 * (spec §5.1). The output is committed, like a lockfile; CI regenerates it
 * and fails on any diff.
 *
 *   --check   write nothing; exit 1 if the committed file is stale
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import YAML from 'yaml'
import { compileGuide, emitModule } from './guide/compile'
import { readArticles, readIfExists } from './guide/fs'
import { CONTENT_DIR, GENERATED_FILE, META_FILE, REPO_ROOT } from './guide/paths'

export function buildGuide() {
  const compiled = compileGuide(readArticles(CONTENT_DIR, REPO_ROOT), YAML.parse(readFileSync(META_FILE, 'utf8')))
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
  console.log(`guide:build — ${compiled.articles.length} articles, ${compiled.sections.length} sections, ${Object.keys(compiled.routeIndex).length} routes → apps/hoa/src/generated/guide.ts`)
}

if (require.main === module) main()
