// Send the release-note email for a production deploy, or preview it.
//
//   pnpm exec tsx scripts/release-notes/send.ts --sha <sha> [--prev <sha>] [--deployed-at <iso>]
//   pnpm exec tsx scripts/release-notes/send.ts --payload payload.json     (from render.ts --json)
//   pnpm exec tsx scripts/release-notes/send.ts --sha <sha> --dry-run [--out file.html]
//
// Env (all required unless --dry-run):
//   RESEND_API_KEY      Resend API key
//   RELEASE_NOTES_TO    comma-separated recipient addresses
//   RELEASE_NOTES_FROM  verified sender, e.g. "Ledger releases <noreply@homeownerledger.com>";
//                       falls back to EMAIL_FROM when that is set
//
// Recipients come from RELEASE_NOTES_TO only — never from a note, a payload
// or a flag. This is an internal owner notification and deliberately skips
// the resident outbound guard. Exit 2 = refused (config), 1 = send failed.

import { runSend } from './lib/run'

runSend(process.argv.slice(2), { env: process.env, cwd: process.cwd(), log: (l) => console.log(l) })
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
