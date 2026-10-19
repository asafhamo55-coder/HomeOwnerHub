/**
 * scripts/guide-check.ts — `pnpm guide:check` (spec §5.3). The rules live
 * in scripts/guide/check.ts (unit-tested); this gathers the inputs.
 * Exit 1 on any error; warnings are printed and do not fail (phase 1).
 */
import { existsSync, readdirSync } from 'node:fs'
import { buildGuide } from './guide-build'
import { checkGuide } from './guide/check'
import { readIfExists, readSourceCorpus, routeSourceHash, routeTemplatesFrom } from './guide/fs'
import { APP_DIR, GENERATED_FILE, GUIDE_EXPECTED_ROUTES, MANIFEST_FILE, SHOTS_DIR, SRC_DIR } from './guide/paths'
import { GUIDE_SHOTS, guideShotWidths } from './guide-shots'
import { resolve } from 'node:path'

function main() {
  const { compiled, text } = buildGuide()
  const manifestText = readIfExists(MANIFEST_FILE)
  const manifest = manifestText ? (JSON.parse(manifestText) as Record<string, { sourceHash: string }>) : {}
  const sourceHashes: Record<string, string> = {}
  for (const s of GUIDE_SHOTS) {
    const h = routeSourceHash(APP_DIR, s.route)
    if (h) sourceHashes[s.name] = h
  }
  const { errors, warnings } = checkGuide({
    compiled,
    generatedOnDisk: readIfExists(GENERATED_FILE),
    generatedFresh: text,
    routeTemplates: routeTemplatesFrom(APP_DIR),
    source: readSourceCorpus(SRC_DIR, [resolve(SRC_DIR, 'generated')]),
    shots: GUIDE_SHOTS.map((s) => ({ name: s.name, widths: guideShotWidths(s), route: s.route })),
    shotFiles: new Set(existsSync(SHOTS_DIR) ? readdirSync(SHOTS_DIR) : []),
    manifest,
    sourceHashes,
    expectedRoutes: GUIDE_EXPECTED_ROUTES,
    today: new Date().toISOString().slice(0, 10),
  })
  for (const w of warnings) console.log(`warning: ${w}`)
  for (const e of errors) console.error(`error: ${e}`)
  console.log(
    `guide:check — ${compiled.articles.length} articles${compiled.drafts.length ? ` (+${compiled.drafts.length} draft${compiled.drafts.length === 1 ? '' : 's'}, not compiled)` : ''}, ${GUIDE_SHOTS.length} shots: ${errors.length} error(s), ${warnings.length} warning(s)`,
  )
  if (errors.length) process.exit(1)
}

main()
