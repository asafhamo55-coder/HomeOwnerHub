import { describe, expect, it } from 'vitest'
import { searchBm25 } from './bm25'
import {
  articleHref,
  articlesFor,
  articlesForPath,
  drawerData,
  getArticle,
  instantSearchData,
  pathsFor,
  searchSections,
  takeMeThereHref,
  topicsFor,
} from './index'

// These run against the committed generated module, so they also prove the
// real corpus routes, searches and filters the way the drawer and /help do.

describe('role filtering', () => {
  it('residents only ever see resident articles, and board members never see resident ones', () => {
    expect(articlesFor('resident').every((a) => a.roles.includes('resident'))).toBe(true)
    expect(articlesFor('board').some((a) => a.roles.includes('resident'))).toBe(false)
  })

  it('admins also see board articles; board members do not see admin-only ones', () => {
    const admin = articlesFor('admin').map((a) => a.id)
    const board = articlesFor('board').map((a) => a.id)
    expect(admin).toContain('start-board-admin')
    expect(board).not.toContain('start-board-admin')
    expect(admin).toEqual(expect.arrayContaining(board))
  })

  it('getArticle keeps resident and board articles on their own surfaces', () => {
    expect(getArticle('resident-portal-basics', 'board')).toBeNull()
    expect(getArticle('dues-record-payment', 'resident')).toBeNull()
    expect(getArticle('dues-record-payment', 'board')?.id).toBe('dues-record-payment')
    expect(getArticle('no-such-article', 'board')).toBeNull()
  })

  it('topics and Start-here paths contain only visible articles', () => {
    for (const { articles } of topicsFor('board')) expect(articles.every((a) => a.roles.includes('board'))).toBe(true)
    expect(pathsFor('resident').map((p) => p.path.id)).toEqual(['resident-start'])
    expect(pathsFor('board').map((p) => p.path.id)).not.toContain('setting-up')
  })
})

describe('drawer route mapping', () => {
  it('a detail page gets the articles for its template', () => {
    expect(articlesForPath('/violations/0f1c', 'board').map((a) => a.id)).toContain('violations-report-and-letter')
    expect(articlesForPath('/meetings/abc/packet', 'admin').map((a) => a.id)).toEqual(['meetings-schedule-and-minutes'])
  })

  it('a page without its own article falls back to its section', () => {
    expect(articlesForPath('/dues/ledger', 'board').map((a) => a.id)).toEqual(expect.arrayContaining(['dues-generate-monthly']))
  })

  it('returns nothing (so the drawer shows Start here) for an uncovered page', () => {
    expect(articlesForPath('/documents', 'admin')).toEqual([])
    // The dashboard article is admin-only.
    expect(articlesForPath('/', 'board')).toEqual([])
  })

  it('residents get the resident article on resident pages only', () => {
    expect(articlesForPath('/resident/dues/pay', 'resident').map((a) => a.id)).toEqual(['resident-dues-statement', 'resident-portal-basics'])
    expect(articlesForPath('/dues', 'resident')).toEqual([])
  })

  it('drawer data is role-filtered and has steps for each article', () => {
    const d = drawerData('resident')
    expect(Object.keys(d.articles)).toContain('resident-portal-basics')
    expect(Object.values(d.articles).every((a) => a.href.startsWith('/resident/help/'))).toBe(true)
    expect(d.articles['resident-portal-basics']!.href).toBe('/resident/help/resident-portal-basics')
    expect(d.articles['resident-portal-basics']!.steps.some((b) => b.t === 'steps')).toBe(true)
    expect(d.articles['resident-portal-basics']!.steps.some((b) => b.t === 'shot')).toBe(false)
  })
})

describe('links', () => {
  it('Take me there goes to the list page for templates with an id', () => {
    expect(takeMeThereHref({ primaryRoute: '/properties/[id]' })).toBe('/properties')
    expect(takeMeThereHref({ primaryRoute: '/dues' })).toBe('/dues')
  })

  it('article hrefs follow the audience', () => {
    expect(articleHref('x', 'board')).toBe('/help/x')
    expect(articleHref('x', 'resident')).toBe('/resident/help/x')
  })
})

describe('search over the real corpus', () => {
  it('full-text finds the task by the words people use', () => {
    expect(searchSections('owner paid by cheque', 'admin')[0]?.article.id).toBe('dues-record-payment')
    expect(searchSections('invite treasurer login', 'admin')[0]?.article.id).toBe('members-invite-board')
    expect(searchSections('paint my fence approval', 'resident')[0]?.article.id).toBe('resident-portal-basics')
  })

  it('full-text never returns articles the role cannot see', () => {
    expect(searchSections('pay dues', 'resident').every((h) => h.article.roles.includes('resident'))).toBe(true)
  })

  it('instant search ranks by title and keywords while typing', () => {
    const data = instantSearchData('board')
    const allow = new Set(data.articles.map((a) => a.id))
    expect(searchBm25(data.index, 'minut', { prefixLast: true, allow })[0]?.id).toBe('meetings-schedule-and-minutes')
    expect(searchBm25(data.index, 'violation lett', { prefixLast: true, allow })[0]?.id).toBe('violations-report-and-letter')
  })

  it('says nothing rather than guessing for an unknown topic', () => {
    // Was "clubhouse booking calendar": since BL-072 the dues articles say
    // "Open the books", and the suffix stripper folds booking and books
    // into one stem. Then "clubhouse reservation calendar": since BL-118
    // the meeting notice adds a calendar invite, so "calendar" is covered.
    // Clubhouse reservations are still a topic the guide does not cover.
    expect(searchSections('clubhouse reservation', 'board')).toEqual([])
  })
})
