// Email the owner the backlog items that are not done yet, or preview it.
//
//   pnpm exec tsx scripts/backlog-email/send.ts --dry-run [--out file.html] [--branch <name>]
//   pnpm exec tsx scripts/backlog-email/send.ts [--idempotency-key <key>] [--branch <name>]
//   pnpm exec tsx scripts/backlog-email/send.ts --summary [--file <path>]
//
// --summary prints open= and hash= lines (hash covers the open items only)
// for .github/workflows/backlog-email.yml. With nothing open a send is
// skipped, not an error.
//
// Env (send only):
//   RESEND_API_KEY      Resend API key
//   OWNER_ACTIONS_TO    comma-separated recipients; defaults to the owner's own address
//   RELEASE_NOTES_FROM  verified sender; falls back to EMAIL_FROM
//
// Exit 2 = refused (config or unreadable backlog), 1 = send failed.

import { runBacklogEmail } from './lib/run'

runBacklogEmail(process.argv.slice(2), { env: process.env, cwd: process.cwd(), log: (l) => console.log(l) })
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
