import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-017 per-attachment states in the thread view, with Retry: component
// tests plus static HTML previews rendered from fixtures (no browser, no
// database). Writes files only when ATTACHMENT_RETRY_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   ATTACHMENT_RETRY_PREVIEW_DIR=.ui-shots/attachment-retry pnpm exec vitest run "apps/hoa/src/app/(dashboard)/inbox/[id]/attachment-retry-previews.test.tsx"

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/lib/inbox/attachment-retry', () => ({ retryAttachment: vi.fn() }))

const { MessageThread, AttachmentChip } = await import('./MessageThread')
type Message = Parameters<typeof MessageThread>[0]['messages'][number]
type File = Message['attachments'][number]

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

const file = (id: string, fileName: string, over: Partial<File> = {}): File => ({
  id,
  fileName,
  sizeBytes: 120_000,
  fetchStatus: 'stored',
  fetchError: null,
  fetchAttempts: 1,
  ...over,
})

const STORED = file('a1', 'gate-quote.pdf')
const DOWNLOADING = file('a2', 'photo-1.jpg', { fetchStatus: 'pending', fetchAttempts: 0 })
const RETRYING = file('a3', 'photo-2.jpg', { fetchStatus: 'pending', fetchAttempts: 1, fetchError: 'Gmail 503' })
const FAILED = file('a4', 'invoice-0912.pdf', { fetchStatus: 'failed', fetchAttempts: 4, fetchError: 'Gmail 503' })
const DISCONNECTED = file('a5', 'minutes.docx', {
  fetchStatus: 'failed',
  fetchError: 'Mailbox was disconnected before this attachment was downloaded.',
})
const TOO_LARGE = file('a6', 'drone-survey.mov', { fetchStatus: 'failed', fetchError: 'Exceeds 26214400 byte limit.' })

const message = (attachments: File[]): Message => ({
  id: 'm1',
  direction: 'inbound',
  fromName: 'Pat Resident',
  fromEmail: 'pat@example.test',
  toEmails: ['board@example.test'],
  subject: 'Fence repair quote',
  bodyText: 'Attached are the quote and the photos of the fence by lot 14.',
  strippedText: 'Attached are the quote and the photos of the fence by lot 14.',
  sentAt: '2026-10-17T14:05:00Z',
  attachments,
  forwardedTo: null,
})

describe('AttachmentChip', () => {
  it('stored: a download link, no Retry', () => {
    const out = html(<AttachmentChip file={STORED} />)
    expect(out).toContain('href="/inbox/attachment/a1"')
    expect(out).not.toContain('Retry')
  })

  it('pending: downloading, then retrying with the attempt count', () => {
    expect(html(<AttachmentChip file={DOWNLOADING} />)).toContain('photo-1.jpg — downloading…')
    expect(html(<AttachmentChip file={RETRYING} />)).toContain('photo-2.jpg — retrying (attempt 2 of 4)…')
  })

  it('failed: says so, with a Retry carrying the attachment id', () => {
    const out = html(<AttachmentChip file={FAILED} />)
    expect(out).toContain('invoice-0912.pdf — couldn’t download')
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*aria-label="Retry downloading invoice-0912.pdf"/)
    expect(out).toContain('name="attachmentId" value="a4"')
  })

  it('failed because the mailbox was disconnected: says why, still retryable', () => {
    const out = html(<AttachmentChip file={DISCONNECTED} />)
    expect(out).toContain('the mailbox was disconnected')
    expect(out).toContain('Retry')
  })

  it('too large: no Retry, points to Gmail', () => {
    const out = html(<AttachmentChip file={TOO_LARGE} />)
    expect(out).toContain('too large to download here — open it in Gmail')
    expect(out).not.toContain('Retry')
  })

  it('the thread lists every state together', () => {
    const out = html(<MessageThread messages={[message([STORED, DOWNLOADING, RETRYING, FAILED, DISCONNECTED, TOO_LARGE])]} />)
    expect(out.match(/<li class="min-w-0 max-w-full">/g)).toHaveLength(6)
    expect(out.match(/>Retry</g)).toHaveLength(2)
  })
})

// ─── Previews ────────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'attachment-states': {
    title: 'Thread view — every attachment state (stored, downloading, retrying, failed + Retry, too large)',
    body: () => <MessageThread messages={[message([STORED, DOWNLOADING, RETRYING, FAILED, DISCONNECTED, TOO_LARGE])]} />,
  },
  'attachment-failed-only': {
    title: 'Thread view — one failed attachment with Retry',
    body: () => <MessageThread messages={[message([STORED, FAILED])]} />,
  },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 900 : 600}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('attachment retry previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.ATTACHMENT_RETRY_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../../../.next/static/css')
    if (!existsSync(cssDir)) throw new Error('build apps/hoa first (rtk pnpm build) for the stylesheet')
    const css = readdirSync(cssDir).filter((f) => f.endsWith('.css'))
    for (const f of css) copyFileSync(join(cssDir, f), join(dir, f))
    const index: string[] = []
    for (const [name, p] of Object.entries(PREVIEWS)) {
      const inner = html(p.body())
      writeFileSync(join(dir, `${name}.light.html`), frameDoc(inner, css, false))
      writeFileSync(join(dir, `${name}.dark.html`), frameDoc(inner, css, true))
      writeFileSync(join(dir, `${name}.html`), indexDoc(p.title, name))
      index.push(`<li><a href="${name}.html">${p.title}</a></li>`)
    }
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Attachment retry previews</title><ul>${index.join('')}</ul>`)
  })
})
