import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-028 inspection mode: component tests for every state of the flow, and
// static HTML previews at 375 and 1440, light and dark. Rendered from
// fixtures; no browser, no database. Writes files only when
// INSPECT_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   INSPECT_PREVIEW_DIR=.ui-shots/inspect pnpm exec vitest run "apps/hoa/src/app/(dashboard)/inspect/inspect-previews.test.tsx"

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/inspect',
  useSearchParams: () => new URLSearchParams(),
}))

const { ToastProvider, ConfirmProvider, Page } = await import('@homeowner-portal/ui')
const { InspectView, missingForSave } = await import('./InspectView')
const { InspectMode } = await import('./InspectMode')
const { newQueueItem } = await import('@/lib/inspect/queue')

type ViewProps = Parameters<typeof InspectView>[0]

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </ToastProvider>,
  ).replace(/<!-- -->/g, '')

const HOMES = [
  { id: 'u1', address: '12 Oak Street', unit_number: null },
  { id: 'u2', address: '14 Oak Street', unit_number: null },
  { id: 'u3', address: '301 Lakeview Drive', unit_number: '2B' },
]

const swatch = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${hue} 35% 55%)"/><rect y="6" width="10" height="4" fill="hsl(${hue} 30% 35%)"/></svg>`)}`

const noop = () => {}
const BASE: ViewProps = {
  homes: HOMES,
  unlinked: 0,
  homeId: '',
  onHomeChange: noop,
  photos: [],
  onAddPhotos: noop,
  onRemovePhoto: noop,
  photoError: null,
  category: null,
  onCategoryChange: noop,
  note: '',
  onNoteChange: noop,
  saving: false,
  onSave: noop,
  saveError: null,
  queue: [],
  saved: [],
  online: true,
  durable: true,
  syncing: false,
  onRetryAll: noop,
  onRetryItem: noop,
  onRemoveItem: noop,
}

const NOW = Date.parse('2026-10-18T15:00:00Z')
const queued = (id: string, homeLabel: string, over: Record<string, unknown> = {}) => ({
  ...newQueueItem({
    id,
    unitId: 'u1',
    homeLabel,
    category: 'trash',
    note: '',
    photos: [{ id: `${id}-p`, blob: null, name: 'a.jpg', type: 'image/jpeg', size: 1 }],
    now: NOW,
  }),
  ...over,
})

const READY: ViewProps = {
  ...BASE,
  homeId: 'u1',
  photos: [
    { id: 'a', previewUrl: swatch(30) },
    { id: 'b', previewUrl: swatch(140) },
  ],
  category: 'lawn_landscape',
  note: 'Grass well over a foot tall along the front walk.',
}

function Screen(props: ViewProps) {
  return (
    <Page
      width="narrow"
      title="Inspect homes"
      description="Pick a home, take photos, say what's wrong, save. Each home becomes a draft letter for the board to review. Nothing is sent to the owner."
      breadcrumbs={[{ label: 'Violations', href: '/violations' }, { label: 'Inspect' }]}
    >
      <InspectView {...props} />
    </Page>
  )
}

const saveButton = (out: string) => out.match(/<button[^>]*>(?:(?!<\/button>).)*Save for review/s)?.[0] ?? ''

describe('inspection mode (rendered)', () => {
  it('start: every step is shown, Save is off and says what is missing', () => {
    const out = html(<Screen {...BASE} />)
    for (const s of ['1. Home', '2. Photos', '3. What’s wrong?', '4. Note', 'Take photo']) expect(out).toContain(s)
    expect(saveButton(out)).toContain('disabled=""')
    expect(out).toContain('Add a home, a photo and what’s wrong to save.')
    // The camera input opens the rear camera on a phone and keeps the upload route's types.
    expect(out).toMatch(/<input[^>]*type="file"[^>]*capture="environment"/)
    expect(out).toMatch(/accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/\*"/)
    // Categories are a radio group with real labels.
    expect(out).toContain('role="radiogroup"')
    expect(out).toContain('Lawn / landscaping')
  })

  it('missingForSave names exactly what is missing', () => {
    expect(missingForSave({ homeId: 'u1', photos: [], category: 'trash' })).toBe('Add a photo to save.')
    expect(missingForSave({ homeId: '', photos: [{ id: 'a', previewUrl: null }], category: null })).toBe('Add a home and what’s wrong to save.')
    expect(missingForSave({ homeId: 'u1', photos: [{ id: 'a', previewUrl: null }], category: 'trash' })).toBeNull()
  })

  it('ready: home picked, photos shown with remove buttons, category checked, Save on', () => {
    const out = html(<Screen {...READY} />)
    expect(out).toContain('12 Oak Street')
    expect(out).toContain('aria-label="Remove photo 2"')
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>Lawn \/ landscaping/)
    expect(saveButton(out)).not.toContain('disabled=""')
    expect(out).toContain('Nothing is sent to the owner.')
  })

  it('offline with homes waiting: says so, counts them, Retry is off until back online', () => {
    const out = html(<Screen {...BASE} online={false} queue={[queued('a', '12 Oak Street'), queued('b', '14 Oak Street')]} />)
    expect(out).toContain('You’re offline')
    expect(out).toContain('2 waiting to upload')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Retry now/s)
    expect(out).toContain('Waiting to upload')
  })

  it('a refused upload is kept with its reason, Retry and Remove', () => {
    const out = html(
      <Screen
        {...BASE}
        queue={[queued('a', '12 Oak Street', { status: 'needs_attention', lastError: 'Photo must be under 25 MB.' })]}
        saved={[{ id: 's1', homeLabel: '301 Lakeview Drive · 2B', category: 'parking' }]}
      />,
    )
    expect(out).toContain('1 needs attention')
    expect(out).toContain('Photo must be under 25 MB.')
    expect(out).toContain('>Retry<')
    expect(out).toContain('>Remove<')
    expect(out).toContain('Saved for review')
    expect(out).toContain('href="/violations/approval-queue"')
  })

  it('no durable storage: tells the person to keep the page open', () => {
    expect(html(<Screen {...BASE} durable={false} />)).toContain('Keep this page open')
  })

  it('no homes: points to Properties; unlinked homes are counted, not hidden silently', () => {
    expect(html(<Screen {...BASE} homes={[]} />)).toContain('No homes to inspect yet')
    expect(html(<Screen {...BASE} unlinked={3} />)).toContain('3 homes aren’t listed because they have no unit record yet.')
  })

  it('the stateful flow renders on the server without a window (effects wait for the browser)', () => {
    const out = html(<InspectMode orgId="org-1" homes={HOMES} unlinked={0} />)
    expect(out).toContain('Save for review')
  })
})

// ─── Previews ────────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'inspect-start': { title: 'Inspect — start of a session', body: () => <Screen {...BASE} /> },
  'inspect-ready': {
    title: 'Inspect — ready to save, one home already saved',
    body: () => <Screen {...READY} saved={[{ id: 's1', homeLabel: '301 Lakeview Drive · 2B', category: 'parking' }]} />,
  },
  'inspect-offline': {
    title: 'Inspect — offline, two homes waiting to upload',
    body: () => <Screen {...BASE} online={false} queue={[queued('a', '12 Oak Street'), queued('b', '14 Oak Street', { lastError: 'No connection. It will upload when you have signal.' })]} />,
  },
  'inspect-needs-attention': {
    title: 'Inspect — a refused upload kept for a person to decide',
    body: () => (
      <Screen
        {...BASE}
        durable={false}
        queue={[queued('a', '12 Oak Street', { status: 'needs_attention', lastError: 'Photo must be under 25 MB.' }), queued('b', '14 Oak Street')]}
        saved={[{ id: 's1', homeLabel: '301 Lakeview Drive · 2B', category: 'parking' }]}
      />
    ),
  },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1500 : 1000}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('inspection mode previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.INSPECT_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../../.next/static/css')
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
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Inspection mode previews</title><ul>${index.join('')}</ul>`)
  })
})
