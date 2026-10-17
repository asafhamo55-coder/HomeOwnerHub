// Render a release note to branded, email-safe HTML.
//
//   pnpm exec tsx scripts/release-notes/render.ts --sha <sha> [--prev <sha>]
//       [--deployed-at <iso>] [--out file.html] [--json payload.json]
//
// Picks the docs/releases/*.md note whose frontmatter sha matches, else a
// `sha: pending` note added in prev..sha, else builds one from the commit
// subjects in prev..sha (no screenshots). See docs/releases/README.md.
//
// --out is a browser preview (images inlined as data: URIs). --json is the
// payload send.ts --payload sends (images as CID attachments).

import { runRender } from './lib/run'

runRender(process.argv.slice(2), { env: process.env, cwd: process.cwd(), log: (l) => console.log(l) })
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
