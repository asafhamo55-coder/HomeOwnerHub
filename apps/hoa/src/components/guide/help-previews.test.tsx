import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Static HTML previews of the BL-070 day-2 help UI, for review without a
// browser or a database. Always renders (so a broken component fails here);
// writes files only when GUIDE_PREVIEW_DIR is set:
//
//   pnpm --filter hoa build   # for the compiled CSS
//   GUIDE_PREVIEW_DIR=.ui-shots/bl-070-day2 pnpm exec vitest run apps/hoa/src/components/guide/help-previews.test.tsx
//
// Each preview shows 375 and 1440 frames in light and dark, using the
// app's real built stylesheet.

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, onClick: _onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('../dashboard/DismissSetupButton', () => ({ DismissSetupButton: () => React.createElement('button', null, 'Dismiss') }))

const { AskGuide } = await import('./AskGuide')
const { WhatsNewEntries } = await import('./WhatsNewEntries')
const { HowThisWorks } = await import('./HowThisWorks')
const { FirstWeekCard } = await import('./FirstWeekCard')
const { SetupChecklistCard } = await import('../dashboard/SetupChecklistCard')
const { AppVersion } = await import('../layout/AppVersion')
const { EmptyState, Button, Card, CardContent } = await import('@homeowner-portal/ui')
const { askGuide } = await import('@/lib/guide/ask')
const { guideHref } = await import('@/lib/guide')
const { buildSetupChecklist } = await import('@/lib/dashboard/setup-checklist')
const { WHATS_NEW } = await import('@/generated/guide')

// Real pipeline output (mocked model), so previews show what validation leaves.
const modelReply = JSON.stringify({
  answer:
    'Use Mark paid on the Dues page when an owner paid by check or cash. [S1]\n1. Open Dues from the sidebar. [S1]\n2. Find the charge and select [[Mark paid]] on that row. [S1]\n3. Check the amount, then select [[Record payment]]. [S1]\nMark paid always records the full amount still owed, dated today. [S2] See https://example.test',
  citations: ['S1', 'S2'],
  route: 'S1',
  covered: true,
})
const strip = <T extends { meta?: unknown }>({ meta: _m, ...r }: T) => r
const answer = strip(await askGuide('How do I record a check payment?', { role: 'admin' }, async () => modelReply))
const refused = strip(await askGuide('Can residents book the clubhouse for a party?', { role: 'admin' }, async () => modelReply))
const rules = strip(await askGuide('Can I paint my front door red?', { role: 'resident' }, async () => modelReply))
const unavailable = strip(
  await askGuide('How do I record a check payment?', { role: 'admin' }, async () => {
    throw new Error('down')
  }),
)

const version = { sha: 'c56061f', shortSha: 'c56061f', label: 'v2026.10.17 · c56061f', title: 'Version c56061f' } as Parameters<typeof AppVersion>[0]['version']
const NOTHING = { mailbox: [1], properties: [3, 0], residents: [0, 0], governingDocs: [null], dues: [0], board: [1] }

const PREVIEWS: Record<string, { title: string; body: React.ReactElement }> = {
  'ask-answer': { title: 'Ask the guide — answer', body: <AskGuide initialQuestion="How do I record a check payment?" initialState={{ status: 'done', result: answer as never }} /> },
  'ask-drawer-answer': {
    title: 'Ask about this page (drawer, compact) — answer',
    body: <AskGuide compact heading="Ask about this page" initialQuestion="How do I record a check payment?" initialState={{ status: 'done', result: answer as never }} />,
  },
  'ask-refusal': { title: 'Ask the guide — refusal (not covered)', body: <AskGuide initialQuestion="Can residents book the clubhouse for a party?" initialState={{ status: 'done', result: refused as never }} /> },
  'ask-rules': { title: 'Ask the guide — rules question → Ask the Docs', body: <AskGuide initialQuestion="Can I paint my front door red?" initialState={{ status: 'done', result: rules as never }} /> },
  'ask-unavailable': { title: 'Ask the guide — model unavailable → matching articles', body: <AskGuide initialQuestion="How do I record a check payment?" initialState={{ status: 'done', result: unavailable as never }} /> },
  'ask-idle': { title: 'Ask the guide — empty box', body: <AskGuide /> },
  'first-week-board': { title: 'Board dashboard — Your first week on the board', body: <FirstWeekCard variant="board" onDismiss={() => {}} /> },
  'first-week-resident': { title: 'Resident home — New here? (first visits)', body: <FirstWeekCard variant="resident" onDismiss={() => {}} /> },
  'setup-checklist-how': { title: 'Setup checklist with How? links', body: <SetupChecklistCard checklist={buildSetupChecklist(NOTHING)} /> },
  'empty-state-how-this-works': {
    title: 'EmptyState with How this works (Dues)',
    body: (
      <EmptyState
        title="No dues billed yet"
        description="Generate this month’s dues for every property, or add a one-off charge."
        action={<Button>Generate October dues</Button>}
        secondaryAction={
          <>
            <Button variant="ghost">Add properties first</Button>
            <HowThisWorks href={guideHref('dues-generate-monthly')} />
          </>
        }
      />
    ),
  },
  'whats-new': {
    title: 'What’s new entries + sidebar version link with unread dot',
    body: (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-5">
            <WhatsNewEntries entries={WHATS_NEW.filter((e) => e.roles.includes('admin'))} showDate />
          </CardContent>
        </Card>
        <div className="flex items-center gap-6 rounded-lg border border-border p-3">
          <AppVersion version={version} href="/whats-new" compact unread />
          <AppVersion version={version} href="/whats-new" compact />
        </div>
      </div>
    ),
  },
}

function page(title: string, inner: string, css: string): string {
  const frame = (w: number, dark: boolean) =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#888;margin:0 0 6px">${w}px · ${dark ? 'dark' : 'light'}</figcaption>` +
    `<div class="${dark ? 'dark' : ''}" style="width:${w}px;box-sizing:border-box"><div class="bg-background text-foreground" style="padding:16px;min-height:120px">${inner}</div></div></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="${css}"></head>
<body style="margin:0;padding:24px;background:#e9e9ec;display:flex;flex-direction:column;gap:24px">
<h1 style="font:600 16px system-ui;margin:0">${title}</h1>
<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">${frame(375, false)}${frame(375, true)}</div>
<div style="display:flex;flex-direction:column;gap:24px">${frame(1440, false)}${frame(1440, true)}</div>
</body></html>`
}

describe('help UI previews', () => {
  it('render', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(renderToStaticMarkup(p.body).length, name).toBeGreaterThan(100)
    expect(answer.kind).toBe('answer')
    expect(refused.kind).toBe('not_covered')
    expect(rules.kind).toBe('rules_question')
    expect(unavailable.kind).toBe('unavailable')
  })

  const out = process.env.GUIDE_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../.next/static/css')
    const css = readdirSync(cssDir).filter((f) => f.endsWith('.css'))
    for (const f of css) copyFileSync(join(cssDir, f), join(dir, f))
    const links = css.map((f) => f)
    const index: string[] = []
    for (const [name, p] of Object.entries(PREVIEWS)) {
      const html = page(p.title, renderToStaticMarkup(p.body), links[0]!).replace(
        `<link rel="stylesheet" href="${links[0]}">`,
        links.map((l) => `<link rel="stylesheet" href="${l}">`).join(''),
      )
      writeFileSync(join(dir, `${name}.html`), html)
      index.push(`<li><a href="${name}.html">${p.title}</a></li>`)
    }
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>BL-070 day 2 previews</title><ul>${index.join('')}</ul>`)
  })
})
