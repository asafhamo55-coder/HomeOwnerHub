// Email the owner the open items in docs/owner-actions.md, or preview it.
//
//   pnpm exec tsx scripts/owner-actions/send.ts --dry-run [--out file.html]
//   pnpm exec tsx scripts/owner-actions/send.ts [--idempotency-key <key>] [--branch <name>]
//   pnpm exec tsx scripts/owner-actions/send.ts --summary [--file <path>] [--allow-missing]
//
// --summary prints open=/urgent=/hash= lines (hash covers the open items
// only) for .github/workflows/owner-actions.yml. With no open items a send
// is skipped, not an error.
//
// Env (all required unless --dry-run or --summary):
//   RESEND_API_KEY      Resend API key
//   OWNER_ACTIONS_TO    comma-separated recipients (the workflow defaults it to the owner)
//   RELEASE_NOTES_FROM  verified sender; falls back to EMAIL_FROM
//
// Exit 2 = refused (config or malformed checklist), 1 = send failed.

import { runOwnerActions } from './lib/run'

runOwnerActions(process.argv.slice(2), { env: process.env, cwd: process.cwd(), log: (l) => console.log(l) })
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
