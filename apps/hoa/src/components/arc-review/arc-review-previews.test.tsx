import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Component tests and static HTML previews for BL-024 (the resident's
// "Check my request against the rules") and BL-027 (the board's AI review
// card on /arc/[id] and its decision dialog). Rendered from fixtures — no
// browser, no database, no model. Writes files only when
// ARC_REVIEW_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   ARC_REVIEW_PREVIEW_DIR=.ui-shots/arc-review pnpm exec vitest run apps/hoa/src/components/arc-review/arc-review-previews.test.tsx
//
// Fixture requests and rules are invented.

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/arc/x',
  useSearchParams: () => new URLSearchParams(),
}))
// Never reached from a static render; mocked so no server module loads.
const { respond, requestInfo, runNow, createArc } = vi.hoisted(() => ({
  respond: vi.fn(),
  requestInfo: vi.fn(),
  runNow: vi.fn(),
  createArc: vi.fn(),
}))
vi.mock('@/lib/board-review', () => ({ respondToArcRequest: respond, requestArcInfo: requestInfo }))
vi.mock('@/lib/arc-review/actions', () => ({ runArcReviewNow: runNow }))
vi.mock('@/lib/resident-submissions', () => ({ createArcRequest: createArc }))
vi.mock('@/components/ai/AiRewriteButton', () => ({ AiRewriteButton: () => null }))

const { ToastProvider, ConfirmProvider } = await import('@homeowner-portal/ui')
const { ArcReviewPanel } = await import('./ArcReviewPanel')
const { ArcReviewActions, ArcDecisionDraftField, suggestedButton } = await import('./ArcReviewActions')
const { ArcPrecheckStep, ArcRequestForm } = await import('@/app/resident/arc/new/ArcRequestForm')
const { draftFor, readReviewRun } = await import('@/lib/arc-review/model')
type Output = import('@/lib/arc-review/model').ArcReviewOutput
type Precheck = import('@/app/resident/arc/new/ArcPrecheckResult').ArcPrecheckResponse
type Load = import('./ArcReviewPanel').ArcReviewPanelLoad

const ARC = '44444444-4444-4444-8444-444444444444'
const D = '33333333-3333-4333-8333-333333333333'

const wrap = (el: React.ReactElement) => (
  <ToastProvider>
    <ConfirmProvider>{el}</ConfirmProvider>
  </ToastProvider>
)
const html = (el: React.ReactElement) => renderToStaticMarkup(wrap(el))

const REVIEW: Output = {
  mode: 'review',
  status: 'answered',
  summary: 'Front-yard fences are limited to 4 feet; this request is for 6 feet in the front yard.',
  confidence: 'HIGH',
  rules: [
    { chunkId: '11111111-1111-4111-8111-111111111111', documentId: D, docType: 'rules', section: '4.2', point: 'Front-yard fences may not exceed 4 feet.', status: 'possible_conflict' },
    { chunkId: '22222222-2222-4222-8222-222222222222', documentId: D, docType: 'rules', section: '4.3', point: 'Chain-link fencing is prohibited.', status: 'fits' },
    { chunkId: '55555555-5555-4555-8555-555555555555', documentId: D, docType: 'declaration', section: '7.1', point: 'No exterior change begins before written ARC approval.', status: 'unclear' },
  ],
  questions: ['Is any part of the fence in the side yard?'],
  missingInfo: ['colors'],
  suggestion: {
    decision: 'approve_with_conditions',
    reasoning: 'A fence is allowed, but section 4.2 caps front-yard fences at 4 feet. Approving at 4 feet in front keeps it within the rules.',
    conditions: ['Front-yard sections no taller than 4 feet.', 'No chain-link.'],
  },
  warnings: [],
  disclaimer: 'A suggestion only. The board decides: nothing is approved, denied or sent until a board member acts.',
}

const PRECHECK_OUT: Output = {
  ...REVIEW,
  mode: 'precheck',
  summary: 'Fence heights depend on the yard: 4 feet in front, 6 feet in the rear.',
  suggestion: null,
  disclaimer: 'This is an automated check of your community’s documents, not a decision. Only the board can approve or deny your application.',
}

function view(state: 'pending' | 'completed' | 'failed', output: Output | null = REVIEW, feedback: string | null = null) {
  return readReviewRun({
    id: 'run-1',
    status: state === 'pending' ? 'pending_human_approval' : state,
    created_at: '2026-10-18T10:00:00Z',
    input: { mode: 'review', arcRequestId: ARC, precheckRunId: 'pre-1' },
    output: output ?? { _error: 'x' },
    human_approved: state === 'completed' ? false : null,
    human_feedback: feedback,
  })
}

const panel = (load: Load, status = 'submitted') => <ArcReviewPanel arcId={ARC} title="Front fence" arcStatus={status} load={load} />

const PRECHECK_ANSWERED: Precheck = {
  status: 'answered',
  summary: PRECHECK_OUT.summary,
  confidence: 'HIGH',
  rules: REVIEW.rules,
  questions: ['Is any part of the fence in the side yard?'],
  missingInfo: ['colors', 'contractor'],
  disclaimer: PRECHECK_OUT.disclaimer,
  runId: 'pre-1',
}
const PRECHECK_REFUSED: Precheck = {
  status: 'no_rules',
  summary:
    'I couldn’t find rules in your community’s documents that clearly apply to this change. That doesn’t mean it is allowed or not allowed — the board decides. You can still submit your application.',
  confidence: 'LOW',
  rules: [],
  questions: [],
  missingInfo: ['dates'],
  disclaimer: PRECHECK_OUT.disclaimer,
  runId: 'pre-2',
}

// ─── Assertions ──────────────────────────────────────────────────────

describe('board AI review card (rendered)', () => {
  it('pending: the suggestion, its reasoning, conditions, cited rules, and the three decision buttons', () => {
    const out = html(panel({ ok: true, review: view('pending'), precheck: PRECHECK_OUT }))
    expect(out).toContain('Suggests: Approve with conditions')
    expect(out).toContain('section 4.2 caps front-yard fences at 4 feet')
    expect(out).toContain('Front-yard sections no taller than 4 feet.')
    expect(out).toContain('Rules § 4.2')
    expect(out).toContain('Declaration § 7.1')
    expect(out).toContain('Possible conflict')
    expect(out).toContain('Colors — the exact color or stain')
    expect(out).toContain('What the resident saw before submitting')
    expect(out).toContain('nothing is approved, denied or sent until a board member acts')
    for (const b of ['Approve', 'Deny', 'Request info']) expect(out).toContain(`>${b}<`)
    // The AI never decides on render.
    expect(respond).not.toHaveBeenCalled()
    expect(requestInfo).not.toHaveBeenCalled()
  })

  it('the suggested button is the primary one and says why to a screen reader', () => {
    const out = html(<ArcReviewActions arcId={ARC} title="t" drafts={{ approved: '', denied: '', more_info: '' }} suggestion="deny" />)
    expect(out).toContain('Matches the AI suggestion')
    expect(suggestedButton('approve_with_conditions')).toBe('approved')
    expect(suggestedButton('need_more_info')).toBe('more_info')
    expect(suggestedButton(null)).toBeNull()
  })

  it('decided: shows what the board did against the suggestion, no decision buttons', () => {
    const out = html(panel({ ok: true, review: view('completed', REVIEW, 'Board denied. AI suggested: approve with conditions.'), precheck: null }, 'denied'))
    expect(out).toContain('Board denied. AI suggested: approve with conditions.')
    expect(out).not.toContain('>Request info<')
    expect(out).not.toContain('Run a fresh review')
  })

  it('no review yet: offers Run AI review on an open application', () => {
    expect(html(panel({ ok: true, review: null, precheck: null }))).toContain('Run AI review')
    expect(html(panel({ ok: true, review: null, precheck: null }, 'approved'))).not.toContain('Run AI review')
  })

  it('a failed run says nothing was decided and offers a re-run', () => {
    const out = html(panel({ ok: true, review: view('failed', null), precheck: null }))
    expect(out).toContain('The AI review couldn’t run')
    expect(out).toContain('Nothing was decided.')
    expect(out).toContain('Run AI review again')
  })

  it('a refusal shows no suggestion and no invented rule', () => {
    const refusal: Output = { ...REVIEW, status: 'no_rules', rules: [], suggestion: null, summary: 'No rules in the governing documents clearly apply to this request, so there is no suggestion.' }
    const out = html(panel({ ok: true, review: view('pending', refusal), precheck: null }))
    expect(out).not.toContain('Suggests:')
    expect(out).toContain('so there is no suggestion')
    expect(out).not.toContain('Rules §')
  })

  it('a failed load is its own state, never "no review"', () => {
    const out = html(panel({ ok: false }))
    expect(out).toContain('Couldn’t load the AI review')
    expect(out).not.toContain('No AI review has run')
  })

  it('the decision dialog body starts from the AI draft and says so', () => {
    const out = html(<ArcDecisionDraftField label="Board response" hint="The resident sees this verbatim." value={draftFor(REVIEW, 'approved')} onChange={() => {}} drafted />)
    expect(out).toContain('Approved with these conditions:')
    expect(out).toContain('Started from the AI review — edit it before sending.')
  })
})

describe('resident pre-check (rendered)', () => {
  it('before checking: the optional step, and the form still submits on its own', () => {
    const out = html(<ArcRequestForm units={[{ unit_id: 'u1', unit_number: '12', address: null, association_id: 'a1', association_name: null, ownership_pct: null, valid_from: '2020-01-01' } as never]} />)
    expect(out).toContain('Check my request against the rules')
    expect(out).toContain('Only the board decides.')
    expect(out).toContain('Submit application')
  })

  it('answered: cited rules, a conflict warning, what the board will ask, and the disclaimer — never a verdict', () => {
    const out = html(<ArcPrecheckStep checking={false} onCheck={() => {}} result={PRECHECK_ANSWERED} error={null} />)
    expect(out).toContain('What your community’s rules say')
    expect(out).toContain('Rules § 4.2')
    expect(out).toContain('One rule may conflict')
    expect(out).toContain('The board will probably ask about')
    expect(out).toContain('Who does the work')
    expect(out).toContain('Only the board can approve or deny your application.')
    expect(out).toContain('You can submit your application whatever this check says.')
    expect(out).toContain('Check again')
    expect(out).not.toMatch(/\bapproved\b/i)
    expect(out).not.toMatch(/\bdenied\b/i)
  })

  it('refused: says it couldn’t find rules, cites nothing', () => {
    const out = html(<ArcPrecheckStep checking={false} onCheck={() => {}} result={PRECHECK_REFUSED} error={null} />)
    expect(out).toContain('No clear rules found')
    expect(out).toContain('I couldn’t find rules')
    expect(out).not.toContain('Rules §')
    expect(out).toContain('When — the planned start and finish dates')
  })

  it('an unavailable check is a warning that keeps submission open', () => {
    const out = html(<ArcPrecheckStep checking={false} onCheck={() => {}} result={null} error="The rules check isn’t available right now. You can still submit your application." />)
    expect(out).toContain('You can still submit your application.')
  })

  it('rate limited (BL-078): the 429 envelope’s friendly message shows as a warning, the button stays usable', async () => {
    const { rateLimitedError } = await import('@/lib/api/rate-limit')
    const { responseErrorMessage } = await import('@/lib/api/client')
    const res = rateLimitedError('arc_precheck', { ok: false, scope: 'user', retryAfterSeconds: 1500 }).toResponse()
    expect(res.status).toBe(429)
    const message = await responseErrorMessage(res, 'FALLBACK')
    const out = html(<ArcPrecheckStep checking={false} onCheck={() => {}} result={null} error={message} />)
    expect(out).toContain('You’ve reached the limit of 10 rules checks an hour. Try again in about 25 minutes.')
    expect(out).toContain('You can still submit your application.')
    expect(out).not.toContain('FALLBACK')
    expect(out).not.toContain('rate_limited')
    expect(out).toContain('role="alert"')
    expect(out).not.toMatch(/<button[^>]*\sdisabled=""/)
  })
})

// ─── Previews ────────────────────────────────────────────────────────

function DialogFrame({ title, description, footer, children }: { title: string; description?: string; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-xl">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
    </div>
  )
}
const btn = (label: string, primary = false) => (
  <span className={primary ? 'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg' : 'rounded-md px-3 py-2 text-sm text-foreground'}>{label}</span>
)
const col = (el: React.ReactElement) => <div className="mx-auto max-w-3xl space-y-6">{el}</div>

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'board-review-pending': {
    title: 'ARC detail — AI review waiting for a decision',
    body: () => col(panel({ ok: true, review: view('pending'), precheck: PRECHECK_OUT })),
  },
  'board-review-decided': {
    title: 'ARC detail — AI review after the board decided',
    body: () => col(panel({ ok: true, review: view('completed', REVIEW, 'Board denied. AI suggested: approve with conditions.'), precheck: null }, 'denied')),
  },
  'board-review-refused-and-failed': {
    title: 'ARC detail — no rules apply / the run failed / no review yet',
    body: () =>
      col(
        <>
          {panel({ ok: true, review: view('pending', { ...REVIEW, status: 'no_rules', rules: [], suggestion: null, missingInfo: ['dimensions', 'dates'], questions: [], summary: 'No rules in the governing documents clearly apply to this request, so there is no suggestion. Decide it on the board’s own reading of the documents.' }), precheck: null })}
          {panel({ ok: true, review: view('failed', null), precheck: null })}
          {panel({ ok: true, review: null, precheck: null })}
        </>,
      ),
  },
  'board-decision-dialog': {
    title: 'Approve from the AI review — the editable draft',
    body: () => (
      <DialogFrame title="Approve this application?" description="Front fence" footer={<>{btn('Cancel')}{btn('Approve application', true)}</>}>
        <ArcDecisionDraftField label="Board response" hint="Optional. Conditions or notes. The resident sees this verbatim in their portal." value={draftFor(REVIEW, 'approved')} onChange={() => {}} drafted />
      </DialogFrame>
    ),
  },
  'resident-precheck-answered': {
    title: 'Resident — check against the rules (rules found, one possible conflict)',
    body: () => <div className="mx-auto max-w-xl"><ArcPrecheckStep checking={false} onCheck={() => {}} result={PRECHECK_ANSWERED} error={null} /></div>,
  },
  'resident-precheck-refused': {
    title: 'Resident — check against the rules (no clear rules found)',
    body: () => <div className="mx-auto max-w-xl"><ArcPrecheckStep checking={false} onCheck={() => {}} result={PRECHECK_REFUSED} error={null} /></div>,
  },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1500 : 1100}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('ARC review previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.ARC_REVIEW_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../.next/static/css')
    if (!existsSync(cssDir)) throw new Error('build apps/hoa first (rtk pnpm build) for the stylesheet')
    const css = readdirSync(cssDir).filter((f) => f.endsWith('.css'))
    for (const f of css) copyFileSync(join(cssDir, f), join(dir, f))
    const index: string[] = []
    for (const [name, p] of Object.entries(PREVIEWS)) {
      const inner = html(p.body()).replace('<details class="rounded-lg bg-subtle px-3.5 py-2 text-sm">', '<details open class="rounded-lg bg-subtle px-3.5 py-2 text-sm">')
      writeFileSync(join(dir, `${name}.light.html`), frameDoc(inner, css, false))
      writeFileSync(join(dir, `${name}.dark.html`), frameDoc(inner, css, true))
      writeFileSync(join(dir, `${name}.html`), indexDoc(p.title, name))
      index.push(`<li><a href="${name}.html">${p.title}</a></li>`)
    }
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>ARC review previews</title><ul>${index.join('')}</ul>`)
  })
})
