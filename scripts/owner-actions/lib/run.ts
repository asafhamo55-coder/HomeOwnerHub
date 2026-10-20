// CLI entry point as a function, so the tests can drive it with a fake env
// and a fake fetch. send.ts only calls this and exits.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from '../../release-notes/lib/build'
import { ConfigError, readSendEnv, sendViaResend, type SendEnv } from '../../release-notes/lib/send'
import { DOC_PATH, renderOwnerActionsEmail } from './email'
import { countUrgent, OwnerActionsFormatError, openItemsHash, parseOwnerActions } from './parse'

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
 * RESEND_API_KEY + RELEASE_NOTES_FROM (or EMAIL_FROM) as for release notes,
 * but recipients from OWNER_ACTIONS_TO only. The workflow sets that from a
 * secret with the owner's own address as its fallback; nothing in the doc,
 * the repo or a flag can add a recipient.
 */
export function readOwnerSendEnv(env: NodeJS.ProcessEnv): SendEnv {
  try {
    return readSendEnv({ ...env, RELEASE_NOTES_TO: env.OWNER_ACTIONS_TO ?? '' })
  } catch (err) {
    if (err instanceof ConfigError) {
      throw new ConfigError(
        err.message.replace('Refusing to send release notes', 'Refusing to send owner actions').replace(/RELEASE_NOTES_TO/g, 'OWNER_ACTIONS_TO'),
      )
    }
    throw err
  }
}

/**
 * Exit codes: 0 ok (including "nothing open, not sent"), 2 refused (config
 * or a malformed checklist), 1 send failed.
 */
export async function runOwnerActions(argv: readonly string[], deps: RunDeps): Promise<number> {
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
    if (args.summary && args['allow-missing']) {
      log('open=0')
      log('urgent=0')
      log('hash=none')
      return 0
    }
    log(`No checklist at ${path.relative(deps.cwd, file) || file}`)
    return 2
  }

  let actions
  try {
    actions = parseOwnerActions(readFileSync(file, 'utf8'))
  } catch (err) {
    if (err instanceof OwnerActionsFormatError) {
      log(`Malformed ${path.basename(file)}: ${err.message}`)
      return 2
    }
    throw err
  }
  const open = actions.open.length
  const urgent = countUrgent(actions.open)
  const hash = open ? openItemsHash(actions.open) : 'none'

  // key=value lines, for the workflow's $GITHUB_OUTPUT.
  if (args.summary) {
    log(`open=${open}`)
    log(`urgent=${urgent}`)
    log(`hash=${hash}`)
    return 0
  }

  const email = renderOwnerActionsEmail(actions, { branch: str(args.branch) })
  log(`${open} open (${urgent} urgent), ${actions.done.length} done · hash ${hash}`)

  if (args['dry-run']) {
    const out = path.resolve(deps.cwd, str(args.out) ?? path.join(tmpdir(), 'owner-actions-preview.html'))
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
    env = readOwnerSendEnv(deps.env)
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
      { fetch: deps.fetch, idempotencyKey: str(args['idempotency-key']), category: 'owner_actions' },
    )
    log(`Sent owner actions to ${res.recipients} recipient(s)${res.id ? ` · id ${res.id}` : ''}`)
    return 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // The idempotency key is the open-items hash, but the HTML also carries
    // the Done list and branch link, so a re-run on another branch can reuse
    // a key with a slightly different payload. Resend answers 409; the
    // owner already has this checklist, so that is a dedupe, not a failure.
    if (/HTTP 409 \((?:invalid_idempotent_request|concurrent_idempotent_requests)\)/.test(msg)) {
      log('Already sent with this idempotency key; not sending again.')
      return 0
    }
    log(msg)
    return 1
  }
}
