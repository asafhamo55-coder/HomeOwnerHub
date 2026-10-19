import { describe, expect, it } from 'vitest'
import { checkGuide, guideRefsInSource, labelInSource, type CheckInput } from './check'
import { compileGuide, emitModule } from './compile'

const META = { topics: [{ id: 'dues', label: 'Dues', description: 'Dues.' }], paths: [] }

function src(body = '', over: Record<string, string> = {}): string {
  const fm: Record<string, string> = {
    id: 'dues-record-payment',
    title: 'Record a payment',
    summary: 'Post a payment.',
    topic: 'dues',
    roles: '[admin, board]',
    routes: '["/dues", "/properties/[id]"]',
    primary_route: '/dues',
    shots: '\n  - name: guide-dues\n    alt: The Dues page',
    reviewed: '2026-10-01',
    ...over,
  }
  return `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\nIntro.\n\n## Steps\n1. Select [[Record payment]] on [Dues](/dues).\n\n![[guide-dues]]\n${body}`
}

function input(over: Partial<CheckInput> = {}, articleSrc = src()): CheckInput {
  const compiled = compileGuide([{ path: 'a.md', src: articleSrc }], META)
  const fresh = emitModule(compiled)
  return {
    compiled,
    generatedOnDisk: fresh,
    generatedFresh: fresh,
    routeTemplates: ['/', '/dues', '/properties', '/properties/[id]'],
    source: `<Button>Record payment</Button>`,
    shots: [{ name: 'guide-dues', widths: [375, 1440], route: '/dues' }],
    shotFiles: new Set(['guide-dues--375.webp', 'guide-dues--1440.webp']),
    manifest: { 'guide-dues': { sourceHash: 'h1' } },
    sourceHashes: { 'guide-dues': 'h1' },
    expectedRoutes: ['/dues'],
    today: '2026-10-17',
    ...over,
  }
}

describe('checkGuide', () => {
  it('fails a guideHref() or guide: article reference in app code that names no article', () => {
    const ok = input({ source: `<Button>Record payment</Button> guideHref('dues-record-payment') guide: 'dues-record-payment'` })
    expect(checkGuide(ok).errors).toEqual([])
    const bad = input({ source: `<Button>Record payment</Button> guideHref("dues-gone") x = { guide: 'no-such-article' }` })
    const errs = checkGuide(bad).errors.join('\n')
    expect(errs).toMatch(/dues-gone/)
    expect(errs).toMatch(/no-such-article/)
    expect(guideRefsInSource(`guideHref('a-b', 'resident') guide: "c"`)).toEqual(['a-b', 'c'])
  })

  it('passes a consistent guide', () => {
    expect(checkGuide(input())).toEqual({ errors: [], warnings: [] })
  })

  it('fails compile errors (schema, H2s, step count)', () => {
    const r = checkGuide(input({}, src('', { summary: '' })))
    expect(r.errors.join()).toMatch(/summary/)
  })

  it('fails a shot missing from GUIDE_SHOTS', () => {
    expect(checkGuide(input({ shots: [] })).errors.join()).toMatch(/guide-dues.*GUIDE_SHOTS/)
  })

  it('fails a webp missing for either width', () => {
    expect(checkGuide(input({ shotFiles: new Set(['guide-dues--375.webp']) })).errors.join()).toMatch(/guide-dues--1440\.webp/)
  })

  it('fails a route, primary route or internal link with no page.tsx', () => {
    expect(checkGuide(input({ routeTemplates: ['/', '/dues'] })).errors.join()).toMatch(/\/properties\/\[id\]/)
    expect(checkGuide(input({ routeTemplates: ['/properties/[id]'] })).errors.join()).toMatch(/primary_route.*\/dues/)
    expect(checkGuide(input({}, src('\nSee [x](/nowhere).\n'))).errors.join()).toMatch(/\/nowhere/)
  })

  it('fails a [[Label]] that no longer appears in apps/hoa/src', () => {
    expect(checkGuide(input({ source: '<Button>Record a payment</Button>' })).errors.join()).toMatch(/Record payment/)
  })

  it('fails an expected core route with no article', () => {
    expect(checkGuide(input({ expectedRoutes: ['/violations'] })).errors.join()).toMatch(/\/violations/)
  })

  it('fails a stale generated module', () => {
    expect(checkGuide(input({ generatedOnDisk: '// old' })).errors.join()).toMatch(/stale/)
    expect(checkGuide(input({ generatedOnDisk: null })).errors.join()).toMatch(/stale|missing/)
  })

  it('warns (does not fail) on a stale screenshot and an old review date', () => {
    const r = checkGuide(input({ sourceHashes: { 'guide-dues': 'h2' }, today: '2027-03-01' }))
    expect(r.errors).toEqual([])
    expect(r.warnings.join()).toMatch(/guide-dues.*changed/)
    expect(r.warnings.join()).toMatch(/reviewed/)
  })

  it('warns on a shot in GUIDE_SHOTS that no article uses', () => {
    const r = checkGuide(input({ shots: [{ name: 'guide-dues', widths: [375, 1440], route: '/dues' }, { name: 'guide-orphan', widths: [375], route: '/' }], shotFiles: new Set(['guide-dues--375.webp', 'guide-dues--1440.webp', 'guide-orphan--375.webp']), sourceHashes: { 'guide-dues': 'h1', 'guide-orphan': 'x' }, manifest: { 'guide-dues': { sourceHash: 'h1' }, 'guide-orphan': { sourceHash: 'x' } } }))
    expect(r.errors).toEqual([])
    expect(r.warnings.join()).toMatch(/guide-orphan/)
  })
})

describe('checkGuide — draft articles', () => {
  const draftSrc = (body = '', over: Record<string, string> = {}) =>
    src(body, { id: 'dues-draft', draft: 'true', reviewed: '2020-01-01', ...over })
  const withDraft = (over: Partial<CheckInput> = {}, d = draftSrc()) => {
    const compiled = compileGuide([{ path: 'a.md', src: src() }, { path: 'd.md', src: d }], META)
    const fresh = emitModule(compiled)
    return input({ compiled, generatedOnDisk: fresh, generatedFresh: fresh, ...over })
  }

  it('passes a consistent draft and skips its reviewed-age warning', () => {
    expect(checkGuide(withDraft())).toEqual({ errors: [], warnings: [] })
  })

  it('checks a draft’s labels, routes, links and shots', () => {
    expect(checkGuide(withDraft({}, draftSrc('', { routes: '["/dues", "/gone"]' }))).errors.join()).toMatch(/d\.md: route \/gone/)
    expect(checkGuide(withDraft({}, draftSrc('\nSee [x](/nowhere).\n'))).errors.join()).toMatch(/d\.md: link to \/nowhere/)
    expect(checkGuide(withDraft({}, draftSrc('\nThen [[Only in draft]].\n'))).errors.join()).toMatch(/d\.md: \[\[Only in draft\]\]/)
    const shot = draftSrc('', { shots: '\n  - name: guide-unknown\n    alt: x' })
    // The body embeds guide-dues, so declare both; guide-unknown is not in GUIDE_SHOTS.
    const both = shot.replace('    alt: x', '    alt: x\n  - name: guide-dues\n    alt: The Dues page')
    expect(checkGuide(withDraft({}, both)).errors.join()).toMatch(/d\.md: screenshot guide-unknown/)
  })

  it('fails a guideHref() in app code that names a draft', () => {
    const r = checkGuide(withDraft({ source: `<Button>Record payment</Button> guideHref('dues-draft')` }))
    expect(r.errors.join()).toMatch(/dues-draft.*draft/)
  })
})

describe('labelInSource', () => {
  it('needs the exact label with no letters glued on either side', () => {
    expect(labelInSource('Record payment', `label="Record payment"`)).toBe(true)
    expect(labelInSource('Record payment', `>Record payments<`)).toBe(false)
    expect(labelInSource('Submit', `'Submitted'`)).toBe(false)
    expect(labelInSource('Submit', `{'Submit'}`)).toBe(true)
  })

  it('accepts JSX entity spellings of apostrophes and ampersands', () => {
    expect(labelInSource("Don't send", `Don&apos;t send`)).toBe(true)
    expect(labelInSource('Approve & post', `Approve &amp; post`)).toBe(true)
    expect(labelInSource('Approve & post', `'Approve & post'`)).toBe(true)
  })
})
