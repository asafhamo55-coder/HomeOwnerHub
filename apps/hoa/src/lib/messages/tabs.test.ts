import { describe, expect, it } from 'vitest'
import { ADMIN_ACCOUNT, BOARD_ACCOUNT, HOA_CREATE, HOA_NAV, activeNavHref } from '@/components/layout/nav'
import {
  MESSAGES_TABS,
  NEW_MESSAGE_CHOICES,
  activeMessagesTab,
  announcementReplyHref,
  canSeeInboxTab,
  isMessagesPath,
  messagesTabsFor,
} from './tabs'

const allLinks = (role: 'admin' | 'board') => [
  ...HOA_NAV.flatMap((g) => g.items),
  ...(role === 'admin' ? ADMIN_ACCOUNT : BOARD_ACCOUNT),
]

describe('Messages nav item (BL-102 A11)', () => {
  it('replaces Inbox and Communications with one Messages item', () => {
    const labels = HOA_NAV.flatMap((g) => g.items.map((i) => i.label))
    expect(labels).toContain('Messages')
    expect(labels).not.toContain('Inbox')
    expect(labels).not.toContain('Communications')
    const hrefs = HOA_NAV.flatMap((g) => g.items.map((i) => i.href))
    expect(hrefs.filter((h) => h === '/communications')).toEqual([])
  })

  it('keeps the old names as palette keywords', () => {
    const messages = HOA_NAV.flatMap((g) => g.items).find((i) => i.label === 'Messages')!
    for (const k of ['inbox', 'email', 'mail', 'communications', 'announcements', 'broadcast']) {
      expect(messages.keywords).toContain(k)
    }
  })

  it.each([
    '/inbox',
    '/inbox/compose',
    '/inbox/1b7c7a3e-0000-4000-8000-000000000000',
    '/communications',
    '/communications/new',
    '/communications/1b7c7a3e-0000-4000-8000-000000000000',
  ])('lights Messages on %s', (path) => {
    for (const role of ['admin', 'board'] as const) {
      expect(activeNavHref(path, allLinks(role))).toBe('/inbox')
    }
  })

  it('still picks the most specific item elsewhere', () => {
    expect(activeNavHref('/settings/members', allLinks('admin'))).toBe('/settings/members')
    expect(activeNavHref('/', allLinks('admin'))).toBe('/')
    expect(activeNavHref('/properties/abc', allLinks('board'))).toBe('/properties')
    expect(activeNavHref('/inboxes', allLinks('board'))).toBeNull()
  })

  it('offers both composers in the palette with the button’s wording', () => {
    const create = new Map(HOA_CREATE.map((c) => [c.href, c.label]))
    expect(create.get('/inbox/compose')).toBe('Email one resident')
    expect(create.get('/communications/new')).toBe('New message to residents')
  })
})

describe('Messages tabs', () => {
  it('are three links to existing URLs, Inbox first', () => {
    expect(MESSAGES_TABS.map((t) => [t.label, t.href])).toEqual([
      ['Inbox', '/inbox'],
      ['Sent to residents', '/communications'],
      ['Drafts', '/communications?status=draft'],
    ])
  })

  it('marks the active tab from the path and status', () => {
    expect(activeMessagesTab('/inbox')).toBe('inbox')
    expect(activeMessagesTab('/inbox/compose')).toBe('inbox')
    expect(activeMessagesTab('/communications')).toBe('sent')
    expect(activeMessagesTab('/communications', 'scheduled')).toBe('sent')
    expect(activeMessagesTab('/communications', 'draft')).toBe('drafts')
    expect(activeMessagesTab('/properties')).toBeNull()
  })

  it('hides the Inbox tab from a role that cannot read the inbox', () => {
    expect(canSeeInboxTab('admin')).toBe(true)
    expect(canSeeInboxTab('board')).toBe(true)
    expect(canSeeInboxTab('resident')).toBe(false)
    expect(canSeeInboxTab(null)).toBe(false)
    expect(messagesTabsFor('sent', { showInbox: false }).map((t) => t.key)).toEqual(['sent', 'drafts'])
    const tabs = messagesTabsFor('drafts', { showInbox: true })
    expect(tabs.map((t) => [t.key, t.active])).toEqual([
      ['inbox', false],
      ['sent', false],
      ['drafts', true],
    ])
  })

  it('knows its paths', () => {
    expect(isMessagesPath('/inbox')).toBe(true)
    expect(isMessagesPath('/communications/new')).toBe(true)
    expect(isMessagesPath('/inboxes')).toBe(false)
  })

  it('New message forks to the two existing composers', () => {
    expect(NEW_MESSAGE_CHOICES.map((c) => [c.label, c.href])).toEqual([
      ['To one resident', '/inbox/compose'],
      ['To many homes', '/communications/new'],
    ])
  })

  it('links a reply inside the Inbox tab', () => {
    expect(announcementReplyHref('r1')).toBe('/inbox?view=replies&reply=r1')
    expect(announcementReplyHref('r1', 3)).toBe('/inbox?view=replies&page=3&reply=r1')
  })
})
