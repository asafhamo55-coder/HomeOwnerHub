// CLI entry point as a function, so the tests can drive it with a fake env
// and a fake fetch. send.ts only calls this and exits.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from '../../release-notes/lib/build'
import { ConfigError, readSendEnv, sendViaResend, type SendEnv } from '../../release-notes/lib/send'
import { parseOwnerActions } from '../../owner-actions/lib/parse'
import { DOC_PATH, renderBacklogEmail } from './email'
import { BacklogFormatError, countPartly, openItemsHash, parseBacklog } from './parse'

/** The account owner. The only fallback recipient, ever. */
export const OWNER_EMAIL = 'asafhamo55@gmail.com'
const OWNER_ACTIONS_DOC = 'docs/owner-actions.md'

export interface RunDeps {
  env: NodeJS.ProcessEnv
  cwd: string
  fetch?: typeof fetch
  log?: (line: string) => void
}

function str(v: string | true | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/**
 * RESEND_API_KEY + RELEASE_NOTES_FROM (or EMAIL_FROM) as for release notes.
 * Recipients come from OWNER_ACTIONS_TO, or the owner's own address when it
 * is unset. Never RELEASE_NOTES_TO; nothing in the doc or a flag can add one.
 */
export function readBacklogSendEnv(env: NodeJS.ProcessEnv): SendEnv {
  try {
    return readSendEnv({ ...env, RELEASE_NOTES_TO: env.OWNER_ACTIONS_TO?.trim() || OWNER_EMAIL })
  } catch (err) {
    if (err instanceof ConfigError) {
      throw new ConfigError(
        err.message.replace('Refusing to send release notes', 'Refusing to send the backlog digest').replace(/RELEASE_NOTES_TO/g, 'OWNER_ACTIONS_TO'),
      )
    }
    throw err
  }
}

/** Open owner-action ids, so items naming one read "Blocked on OA-n". Best effort. */
function openOwnerActions(cwd: string): string[] {
  const file = path.join(cwd, OWNER_ACTIONS_DOC)
  if (!existsSync(file)) return []
  try {
    return parseOwnerActions(readFileSync(file, 'utf8')).open.map((a) => a.id)
  } catch {
    return []
  }
}

/** Exit codes: 0 ok (including "nothing open, not sent"), 2 refused, 1 send failed. */
export async function runBacklogEmail(argv: readonly string[], deps: RunDeps): Promise<number> {
  const log = deps.log ?? (() => {})
  const args = parseArgs(argv)
  for (const flag of ['to', 'cc', 'bcc', 'from', 'reply-to', 'recipients']) {
    if (flag in args) {
      log(`Refusing: --${flag} is not accepted. Recipients and sender come only from OWNER_ACTIONS_TO / RELEASE_NOTES_FROM.`)
      return 2
    }
  }
  const file = path.resolve(deps.cwd, str(args.file) ?? DOC_PATH)
  if (!existsSync(file)) {
    log(`No backlog at ${path.relative(deps.cwd, file) || file}`)
    return 2
  }

  let backlog
  try {
    backlog = parseBacklog(readFileSync(file, 'utf8'), openOwnerActions(deps.cwd))
  } catch (err) {
    if (err instanceof BacklogFormatError) {
      log(`Malformed ${path.basename(file)}: ${err.message}`)
      return 2
    }
    throw err
  }
  const open = backlog.open.length
  const hash = open ? openItemsHash(backlog.open) : 'none'

  // key=value lines, for the workflow's $GITHUB_OUTPUT.
  if (args.summary) {
    log(`open=${open}`)
    log(`hash=${hash}`)
    return 0
  }

  const email = renderBacklogEmail(backlog, { branch: str(args.branch) })
  const groups = backlog.groups.map((g) => `${g.name} ${g.items.length}`).join(', ')
  log(`${open} open (${countPartly(backlog.open)} partly done), ${backlog.closed.length} closed · ${groups} · hash ${hash}`)

  if (args['dry-run']) {
    const out = path.resolve(deps.cwd, str(args.out) ?? path.join(tmpdir(), 'backlog-email-preview.html'))
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, email.html)
    log(`Subject: ${email.subject}`)
    log(`Dry run: wrote ${out}; nothing sent.`)
    return 0
  }

  if (!open) {
    log('Nothing open; not sending.')
    return 0
  }

  let env: SendEnv
  try {
    env = readBacklogSendEnv(deps.env)
  } catch (err) {
    if (err instanceof ConfigError) {
      log(err.message)
      return 2
    }
    throw err
  }

  try {
    const res = await sendViaResend(
      { sha: hash, subject: email.subject, html: email.html, text: email.text, attachments: [] },
      env,
      { fetch: deps.fetch, idempotencyKey: str(args['idempotency-key']), category: 'backlog_digest' },
    )
    log(`Sent the backlog digest to ${res.recipients} recipient(s)${res.id ? ` · id ${res.id}` : ''}`)
    return 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Same key, slightly different payload (another branch's link): Resend
    // answers 409. The owner already has this digest; a dedupe, not a failure.
    if (/HTTP 409 \((?:invalid_idempotent_request|concurrent_idempotent_requests)\)/.test(msg)) {
      log('Already sent with this idempotency key; not sending again.')
      return 0
    }
    log(msg)
    return 1
  }
}
