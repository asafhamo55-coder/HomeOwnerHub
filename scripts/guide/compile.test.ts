import { describe, expect, it } from 'vitest'
import { compileArticle, compileGuide, emitModule, parseFrontmatter } from './compile'

const META = {
  topics: [
    { id: 'dues', label: 'Dues & payments', description: 'Dues.' },
    { id: 'setup', label: 'Getting started', description: 'Setup.' },
  ],
  paths: [{ id: 'setup', label: "I'm setting up the HOA", description: 'Start.', roles: ['admin' as const], articles: ['dues-record-payment'] }],
}

function article(over: Record<string, string> = {}, body?: string): string {
  const fm = {
    id: 'dues-record-payment',
    title: 'Record a payment by check or cash',
    summary: 'Post a payment an owner made outside the portal.',
    topic: 'dues',
    roles: '[admin, board]',
    routes: '["/dues", "/properties/[id]"]',
    primary_route: '/dues',
    keywords: '[check, cheque]',
    shots: '\n  - name: guide-dues-record-payment\n    alt: The Dues page with Record payment highlighted',
    related: '[]',
    reviewed: '2026-10-17',
    ...over,
  }
  const yaml = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return `---\n${yaml}\n---\n\n${
    body ??
    `Use this when the owner paid by **check**.

## Before you start
- Only board admins and board members can record payments.

## Steps
1. Open **Dues** from the sidebar.
2. Select [[Record payment]].
3. See [the dues page](/dues) or [billing](guide:dues-record-payment).

![[guide-dues-record-payment]]

## Good to know
> Online payments are set up in Settings.
`
  }`
}

describe('parseFrontmatter', () => {
  it('splits YAML frontmatter from the body', () => {
    const { data, body } = parseFrontmatter('---\nid: x\n---\nHello')
    expect(data).toEqual({ id: 'x' })
    expect(body.trim()).toBe('Hello')
  })

  it('reports a file with no frontmatter', () => {
    expect(() => parseFrontmatter('Hello')).toThrow(/frontmatter/)
  })
})

describe('compileArticle', () => {
  it('compiles frontmatter and body into the block AST', () => {
    const { article: a, errors } = compileArticle(article(), 'x.md')
    expect(errors).toEqual([])
    expect(a?.id).toBe('dues-record-payment')
    expect(a?.primaryRoute).toBe('/dues')
    expect(a?.roles).toEqual(['admin', 'board'])
    expect(a?.sections.map((s) => s.id)).toEqual(['overview', 'before-you-start', 'steps', 'good-to-know'])
    const steps = a!.sections[2]!.blocks
    expect(steps[0]).toEqual({
      t: 'steps',
      items: [
        [{ t: 'text', v: 'Open ' }, { t: 'strong', c: [{ t: 'text', v: 'Dues' }] }, { t: 'text', v: ' from the sidebar.' }],
        [{ t: 'text', v: 'Select ' }, { t: 'ui', label: 'Record payment' }, { t: 'text', v: '.' }],
        [
          { t: 'text', v: 'See ' },
          { t: 'link', kind: 'route', href: '/dues', c: [{ t: 'text', v: 'the dues page' }] },
          { t: 'text', v: ' or ' },
          { t: 'link', kind: 'guide', href: 'dues-record-payment', c: [{ t: 'text', v: 'billing' }] },
          { t: 'text', v: '.' },
        ],
      ],
    })
    expect(steps[1]).toEqual({ t: 'shot', name: 'guide-dues-record-payment', alt: 'The Dues page with Record payment highlighted' })
    expect(a!.sections[3]!.blocks[0]).toEqual({ t: 'callout', c: [[{ t: 'text', v: 'Online payments are set up in Settings.' }]] })
  })

  it('rejects frontmatter that does not match the schema', () => {
    expect(compileArticle(article({ summary: '' }), 'x.md').errors.join()).toMatch(/summary/)
    expect(compileArticle(article({ roles: '[treasurer]' }), 'x.md').errors.join()).toMatch(/roles/)
    expect(compileArticle(article({ summary: 'x'.repeat(161) }), 'x.md').errors.join()).toMatch(/summary/)
    expect(compileArticle(article({ colour: 'red' }), 'x.md').errors.join()).toMatch(/colour/)
    expect(compileArticle(article({ reviewed: 'yesterday' }), 'x.md').errors.join()).toMatch(/reviewed/)
  })

  it('only allows the fixed set of H2 headings', () => {
    const { errors } = compileArticle(article({}, 'Intro.\n\n## Tips and tricks\nText.\n'), 'x.md')
    expect(errors.join()).toMatch(/Tips and tricks/)
  })

  it('fails a Steps list longer than 7 items', () => {
    const body = `Intro.\n\n## Steps\n${Array.from({ length: 8 }, (_, i) => `${i + 1}. Step ${i + 1}.`).join('\n')}\n`
    expect(compileArticle(article({}, body), 'x.md').errors.join()).toMatch(/7/)
  })

  it('bans plain images, raw HTML and links that are neither routes nor guide links', () => {
    expect(compileArticle(article({}, 'Intro ![x](/a.png)\n'), 'x.md').errors.join()).toMatch(/image/i)
    expect(compileArticle(article({}, 'Intro <b>x</b>\n'), 'x.md').errors.join()).toMatch(/HTML/)
    expect(compileArticle(article({}, 'Intro [x](https://example.com)\n'), 'x.md').errors.join()).toMatch(/link/i)
  })

  it('requires an embedded shot to be declared in the frontmatter (for its alt text)', () => {
    expect(compileArticle(article({}, 'Intro.\n\n![[guide-undeclared]]\n'), 'x.md').errors.join()).toMatch(/guide-undeclared/)
  })

  it('rejects an H1 (the title comes from the frontmatter)', () => {
    expect(compileArticle(article({}, '# Title\n\nIntro.\n'), 'x.md').errors.join()).toMatch(/H1|heading/)
  })
})

describe('compileGuide', () => {
  it('builds sections, the route index and both search indexes', () => {
    const out = compileGuide([{ path: 'a.md', src: article() }], META)
    expect(out.errors).toEqual([])
    expect(out.articles).toHaveLength(1)
    expect(out.sections.map((s) => s.sectionId)).toEqual(['overview', 'before-you-start', 'steps', 'good-to-know'])
    expect(out.sections[2]!.text).toContain('Select Record payment.')
    expect(out.routeIndex).toEqual({ '/dues': ['dues-record-payment'], '/properties/[id]': ['dues-record-payment'] })
    expect(out.searchIndex.articles.ids).toEqual(['dues-record-payment'])
    expect(out.searchIndex.sections.ids).toContain('dues-record-payment#steps')
  })

  it('fails duplicate ids, unknown topics, unknown related/guide links and unknown path articles', () => {
    const dup = compileGuide([{ path: 'a.md', src: article() }, { path: 'b.md', src: article() }], META)
    expect(dup.errors.join()).toMatch(/duplicate/i)
    expect(compileGuide([{ path: 'a.md', src: article({ topic: 'nope' }) }], META).errors.join()).toMatch(/topic/)
    expect(compileGuide([{ path: 'a.md', src: article({ related: '[ghost]' }) }], META).errors.join()).toMatch(/ghost/)
    expect(compileGuide([{ path: 'a.md', src: article({}, 'See [x](guide:ghost-article).\n') }], META).errors.join()).toMatch(/ghost-article/)
    expect(compileGuide([{ path: 'a.md', src: article({ id: 'other-id' }) }], META).errors.join()).toMatch(/dues-record-payment/)
  })

  it('emits a deterministic TypeScript module', () => {
    const a = emitModule(compileGuide([{ path: 'a.md', src: article() }], META))
    const b = emitModule(compileGuide([{ path: 'a.md', src: article() }], META))
    expect(a).toBe(b)
    expect(a).toMatch(/^\/\/ GENERATED/)
    expect(a).toContain('export const GUIDE_ARTICLES')
    expect(a).toContain('export const GUIDE_SECTIONS')
    expect(a).toContain('export const GUIDE_ROUTE_INDEX')
    expect(a).toContain('export const GUIDE_SEARCH_INDEX')
  })
})
