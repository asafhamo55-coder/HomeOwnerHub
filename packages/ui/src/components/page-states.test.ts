import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Page } from './Page'
import { LoadFailed } from './LoadFailed'
import { PageSkeleton } from './PageSkeleton'
import { NoOrgSelected } from './NoOrgSelected'
import { Pager, pageRange, pagerState, parsePageParam } from './Pager'
import { DataTable } from './DataTable'

// Server-render tests for the phase-1 primitives
// (docs/specs/2026-10-15-enterprise-ux-plan.md). createElement rather than
// JSX so this stays a plain .ts file under the root vitest config.

describe('parsePageParam', () => {
  it.each([
    [undefined, 1],
    [null, 1],
    ['', 1],
    ['1', 1],
    ['3', 3],
    [' 4 ', 4],
    ['0', 1],
    ['-2', 1],
    ['2.5', 1],
    ['abc', 1],
    ['1e3', 1],
    ['99999999999999999999', 1],
    [['5', '6'], 5],
  ])('%j -> %i', (raw, expected) => {
    expect(parsePageParam(raw as string | string[] | null | undefined)).toBe(expected)
  })
})

describe('pageRange', () => {
  it('produces inclusive PostgREST bounds', () => {
    expect(pageRange(1, 100)).toEqual({ from: 0, to: 99 })
    expect(pageRange(3, 25)).toEqual({ from: 50, to: 74 })
  })
})

describe('pagerState', () => {
  it('is a single page when everything fits on page 1', () => {
    expect(pagerState({ page: 1, pageSize: 50, total: 50, rowCount: 50 }).singlePage).toBe(true)
    expect(pagerState({ page: 1, pageSize: 50, total: 0, rowCount: 0 }).singlePage).toBe(true)
  })

  it('reports the visible window and neighbours', () => {
    const s = pagerState({ page: 2, pageSize: 50, total: 120, rowCount: 50 })
    expect(s).toMatchObject({ first: 51, last: 100, totalPages: 3, hasPrev: true, hasNext: true, pastEnd: false })
  })

  it('has no Next on the last partial page', () => {
    const s = pagerState({ page: 3, pageSize: 50, total: 120, rowCount: 20 })
    expect(s).toMatchObject({ first: 101, last: 120, hasNext: false })
  })

  it('flags a page past the end instead of claiming the list is empty', () => {
    const s = pagerState({ page: 9, pageSize: 50, total: 120, rowCount: 0 })
    expect(s.pastEnd).toBe(true)
    expect(s.singlePage).toBe(false)
  })
})

describe('Pager', () => {
  const hrefFor = (p: number) => `/violations?page=${p}`

  it('renders nothing when one page holds everything', () => {
    expect(renderToStaticMarkup(h(Pager, { page: 1, pageSize: 100, total: 40, rowCount: 40, hrefFor }))).toBe('')
  })

  it('says how much is shown out of the total and links both ways', () => {
    const html = renderToStaticMarkup(
      h(Pager, { page: 2, pageSize: 100, total: 340, rowCount: 100, hrefFor, noun: 'violations' }),
    )
    expect(html).toContain('Showing 101–200 of 340 violations')
    expect(html).toContain('href="/violations?page=1"')
    expect(html).toContain('href="/violations?page=3"')
  })

  it('disables Previous on page 1', () => {
    const html = renderToStaticMarkup(h(Pager, { page: 1, pageSize: 10, total: 30, rowCount: 10, hrefFor }))
    expect(html).not.toContain('page=0')
    expect(html).toContain('aria-disabled="true"')
  })

  it('offers a way back from a page past the end', () => {
    const html = renderToStaticMarkup(h(Pager, { page: 7, pageSize: 10, total: 30, rowCount: 0, hrefFor }))
    expect(html).toContain('past the end')
    expect(html).toContain('href="/violations?page=1"')
  })

  it('uses the supplied link component', () => {
    const Link = (props: { href: string; children?: unknown }) =>
      h('a', { href: props.href, 'data-router': 'yes' }, props.children as string)
    const html = renderToStaticMarkup(
      h(Pager, { page: 1, pageSize: 10, total: 30, rowCount: 10, hrefFor, linkAs: Link }),
    )
    expect(html).toContain('data-router="yes"')
  })
})

describe('LoadFailed', () => {
  it('names what failed and says it is not an empty list', () => {
    const html = renderToStaticMarkup(h(LoadFailed, { what: 'violations' }))
    expect(html).toContain('Couldn’t load violations')
    expect(html).toContain('not an empty list')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Refresh the page to try again.')
    expect(html).not.toContain('href=')
  })

  it('links Try again when given a retry URL', () => {
    const html = renderToStaticMarkup(h(LoadFailed, { what: 'dues', retryHref: '/dues?page=2' }))
    expect(html).toContain('href="/dues?page=2"')
  })

  it('has no way to render a raw error message', () => {
    // The props type has no error/message field; extra props are ignored.
    const html = renderToStaticMarkup(
      h(LoadFailed, { what: 'dues', ...({ error: new Error('relation "x" does not exist') } as object) }),
    )
    expect(html).not.toContain('does not exist')
  })
})

describe('Page', () => {
  it('renders exactly one h1 with the title, at a fixed width', () => {
    const html = renderToStaticMarkup(h(Page, { title: 'Violations', width: 'default' }, 'body'))
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('max-w-5xl')
    expect(html).toContain('data-page-width="default"')
  })

  it('maps the three widths to three max-widths only', () => {
    expect(renderToStaticMarkup(h(Page, { title: 't', width: 'narrow' }))).toContain('max-w-3xl')
    expect(renderToStaticMarkup(h(Page, { title: 't', width: 'wide' }))).toContain('max-w-7xl')
  })

  it('renders a back link, actions and tabs when given', () => {
    const html = renderToStaticMarkup(
      h(Page, {
        title: 'Dues',
        back: { href: '/accounting', label: 'Accounting' },
        actions: h('button', null, 'Add due'),
        tabs: h('nav', { id: 'tabs' }),
      }),
    )
    expect(html).toContain('href="/accounting"')
    expect(html).toContain('Add due')
    expect(html).toContain('id="tabs"')
  })

  it('lets a custom header supply the h1', () => {
    const html = renderToStaticMarkup(h(Page, { header: h('h1', null, 'Good morning') }))
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('Good morning')
  })
})

describe('PageSkeleton', () => {
  it('announces loading and renders the requested number of cards', () => {
    const html = renderToStaticMarkup(h(PageSkeleton, { cards: 2 }))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading…')
    expect(html.match(/rounded-xl/g)).toHaveLength(2)
  })
})

describe('NoOrgSelected', () => {
  it('explains instead of rendering a blank page', () => {
    const html = renderToStaticMarkup(h(NoOrgSelected, { noun: 'workspace', href: '/x' }))
    expect(html).toContain('No workspace selected')
    expect(html).toContain('href="/x"')
  })
})

describe('DataTable', () => {
  const rows = [
    { id: 'a', unit: '101', amount: 250 },
    { id: 'b', unit: '102', amount: 1200 },
  ]

  it('wraps the table in a horizontal scroll container', () => {
    const html = renderToStaticMarkup(
      h(DataTable<(typeof rows)[number]>, {
        rows,
        rowKey: (r) => r.id,
        caption: 'Assessments',
        columns: [
          { key: 'unit', header: 'Unit', cell: (r) => r.unit },
          { key: 'amount', header: 'Amount', numeric: true, cell: (r) => `$${r.amount}` },
        ],
      }),
    )
    expect(html).toMatch(/overflow-x-auto[^>]*><table/)
    expect(html).toContain('<caption class="sr-only">Assessments</caption>')
    expect(html).toContain('scope="col"')
    expect(html.match(/text-right/g)?.length).toBe(3) // header + two cells
    expect(html).toContain('$1200')
  })

  it('can skip the Card frame when nested in one', () => {
    const html = renderToStaticMarkup(
      h(DataTable<{ id: string }>, {
        rows: [{ id: 'x' }],
        rowKey: (r) => r.id,
        framed: false,
        columns: [{ key: 'id', header: 'Id', cell: (r) => r.id }],
      }),
    )
    expect(html).not.toContain('rounded-xl')
  })
})
