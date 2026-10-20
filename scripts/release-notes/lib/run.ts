// CLI entry points, as functions so the tests can drive them with a fake
// env and a fake fetch. render.ts / send.ts only call these and exit.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildEmail, parseArgs, resolveSha, toPayload, type EmailPayload } from './build'
import type { ImageProcessor } from './images'
import { ConfigError, readSendEnv, sendViaResend, type SendEnv } from './send'

export interface RunDeps {
  env: NodeJS.ProcessEnv
  cwd: string
  fetch?: typeof fetch
  log?: (line: string) => void
  imageProcessor?: ImageProcessor
}

type Args = Record<string, string | true>

function str(v: string | true | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined
}

async function buildPayload(args: Args, deps: RunDeps): Promise<EmailPayload> {
  const root = path.resolve(deps.cwd, str(args.root) ?? '.')
  const sha = resolveSha(root, str(args.sha) ?? 'HEAD')
  const prevRef = str(args.prev)
  const previousSha = prevRef ? resolveSha(root, prevRef) : null
  const deployedAtArg = str(args['deployed-at'])
  const deployedAt = deployedAtArg ? new Date(deployedAtArg) : undefined
  if (deployedAt && Number.isNaN(deployedAt.getTime())) {
    throw new ConfigError(`--deployed-at is not a date: ${deployedAtArg}`)
  }
  const shotsDirArg = str(args['ui-shots-dir'])
  const uiShotsDir = shotsDirArg ? path.resolve(deps.cwd, shotsDirArg) : undefined
  const built = await buildEmail({ root, sha, previousSha, deployedAt, imageProcessor: deps.imageProcessor, uiShotsDir })
  deps.log?.(
    `notes: ${built.note.source === 'file' ? built.note.files.map((f) => path.relative(root, f)).join(', ') : 'generated from commit subjects'}` +
      ` · sha ${sha.slice(0, 7)} · ${built.images.length} screenshot(s)`,
  )
  if (built.ciShots) {
    const c = built.ciShots
    deps.log?.(
      `ci shots (${c.mode}): requested ${c.requested.join(', ') || 'none'}` +
        ` · attached ${c.attached.length}${c.missing.length ? ` · missing ${c.missing.join(', ')}` : ''}` +
        (built.note.screenshotNotice ? ' · notice added' : ''),
    )
  }
  return toPayload(built)
}

function readPayload(file: string): EmailPayload {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<EmailPayload>
  if (typeof raw.sha !== 'string' || typeof raw.subject !== 'string' || typeof raw.html !== 'string') {
    throw new ConfigError(`${path.basename(file)} is not a release-note payload`)
  }
  // Content fields only. Anything else in the file (a stray "to", say) is dropped.
  return {
    sha: raw.sha,
    subject: raw.subject,
    html: raw.html,
    text: typeof raw.text === 'string' ? raw.text : '',
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
  }
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

function defaultOut(deps: RunDeps, args: Args, sha: string): string {
  return path.resolve(deps.cwd, str(args.out) ?? `.release-notes/${sha.slice(0, 7)}.html`)
}

/**
 * The HTML with cid: references swapped for data: URIs, so the file opens
 * correctly in a browser. The email itself keeps cid: references.
 */
export function previewHtml(p: EmailPayload): string {
  let html = p.html
  for (const a of p.attachments) {
    html = html.split(`cid:${a.content_id}`).join(`data:${a.content_type};base64,${a.content}`)
  }
  return html
}

/** render.ts: writes the browser preview HTML and, with --json, the send payload. */
export async function runRender(argv: readonly string[], deps: RunDeps): Promise<number> {
  const args = parseArgs(argv)
  const payload = await buildPayload(args, deps)
  const out = defaultOut(deps, args, payload.sha)
  write(out, previewHtml(payload))
  deps.log?.(`html: ${out}`)
  const json = str(args.json)
  if (json) {
    const file = path.resolve(deps.cwd, json)
    write(file, JSON.stringify(payload))
    deps.log?.(`payload: ${file}`)
  }
  return 0
}

/** send.ts. Exit codes: 0 sent / dry run written, 2 refused (config), 1 send failed. */
export async function runSend(argv: readonly string[], deps: RunDeps): Promise<number> {
  const args = parseArgs(argv)
  const log = deps.log ?? (() => {})
  const dryRun = args['dry-run'] === true

  for (const flag of ['to', 'cc', 'bcc', 'from', 'reply-to', 'recipients']) {
    if (flag in args) {
      log(`Refusing: --${flag} is not accepted. Recipients and sender come only from RELEASE_NOTES_TO / RELEASE_NOTES_FROM.`)
      return 2
    }
  }

  try {
    // Checked before any work, so a misconfigured run fails fast and loudly.
    const env: SendEnv | null = dryRun ? null : readSendEnv(deps.env)
    const payloadFile = str(args.payload)
    const payload = payloadFile ? readPayload(path.resolve(deps.cwd, payloadFile)) : await buildPayload(args, deps)

    if (!env) {
      const out = defaultOut(deps, args, payload.sha)
      write(out, previewHtml(payload))
      log(`dry run: nothing sent. html: ${out}`)
      log(`subject: ${payload.subject}`)
      return 0
    }

    const result = await sendViaResend(payload, env, {
      fetch: deps.fetch,
      idempotencyKey: str(args['idempotency-key']) ?? `release-notes-${payload.sha}`,
    })
    log(
      `sent release notes for ${payload.sha.slice(0, 7)} to ${result.recipients} recipient(s); resend id ${result.id ?? 'unknown'}`,
    )
    return 0
  } catch (err) {
    if (err instanceof ConfigError) {
      log(err.message)
      return 2
    }
    log(err instanceof Error ? err.message : String(err))
    return 1
  }
}
