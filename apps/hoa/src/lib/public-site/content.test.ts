import { describe, expect, it } from 'vitest'
import {
  canPublishDocument,
  canPublishDocumentToSite,
  htmlToPlainText,
  sensitiveHints,
  slugify,
  toPublicView,
  validateSlug,
  type ItemRow,
  type SiteRow,
} from './content'

const site: SiteRow = {
  slug: 'oak-hollow',
  published: true,
  title: 'Oak Hollow HOA',
  about: 'A community of 80 homes.',
  contact_email: 'board@example.org',
  contact_phone: null,
}

describe('public page projection', () => {
  it('shows nothing for an unpublished site', () => {
    expect(toPublicView({ ...site, published: false }, [])).toBeNull()
  })

  it('never lets extra row fields through (names, addresses, balances, private files)', () => {
    const leaky = [
      {
        id: 'i1',
        kind: 'document',
        title: 'Rules',
        body: null,
        posted_at: '2026-01-01T00:00:00Z',
        owner_name: 'Jane Resident',
        unit_address: '12 Oak Lane',
        balance_cents: 123400,
        storage_path: 'org/secret/private.pdf',
        parsed_text: 'private text',
      },
      {
        id: 'i2',
        kind: 'announcement',
        title: 'Pool opens',
        body: 'The pool opens May 1.',
        posted_at: '2026-02-01T00:00:00Z',
        owner_name: 'Jane Resident',
        balance_cents: 55500,
      },
    ] as unknown as ItemRow[]
    const view = toPublicView({ ...site, owner_email: 'jane@home.test', stripe: 'acct_x' } as SiteRow, leaky)
    const text = JSON.stringify(view)
    for (const secret of ['Jane', 'Oak Lane', '123400', '55500', 'secret', 'private', 'jane@home', 'acct_x']) {
      expect(text).not.toContain(secret)
    }
    expect(view?.documents[0]?.href).toBe('/s/oak-hollow/documents/i1')
    expect(view?.announcements).toHaveLength(1)
  })

  it('ignores items of an unknown kind and announcements without a body', () => {
    const view = toPublicView(site, [
      { id: 'a', kind: 'ledger', title: 'x', body: 'y', posted_at: '2026-01-01T00:00:00Z' },
      { id: 'b', kind: 'announcement', title: 'x', body: null, posted_at: '2026-01-01T00:00:00Z' },
    ])
    expect(view?.documents).toEqual([])
    expect(view?.announcements).toEqual([])
  })

  it('lists newest announcements first', () => {
    const view = toPublicView(site, [
      { id: 'old', kind: 'announcement', title: 'Old', body: 'a', posted_at: '2026-01-01T00:00:00Z' },
      { id: 'new', kind: 'announcement', title: 'New', body: 'b', posted_at: '2026-03-01T00:00:00Z' },
    ])
    expect(view?.announcements.map((a) => a.id)).toEqual(['new', 'old'])
  })
})

describe('document eligibility', () => {
  it('needs a stored file and refuses AI drafts and superseded versions', () => {
    expect(canPublishDocument({ storagePath: 'a/b.pdf' })).toBe(true)
    expect(canPublishDocument({ storagePath: '' })).toBe(false)
    expect(canPublishDocument({ storagePath: null })).toBe(false)
    expect(canPublishDocument({ storagePath: 'a/b.pdf', aiGenerated: true })).toBe(false)
    expect(canPublishDocument({ storagePath: 'a/b.pdf', superseded: true })).toBe(false)
  })
})

describe('documents allowed on a public page', () => {
  const base = { source: 'governing' as const, type: 'bylaws', storagePath: 'a/b.pdf' }
  it('uses the resident visibility rule', () => {
    expect(canPublishDocumentToSite(base, 'a1')).toBe(true)
    expect(canPublishDocumentToSite({ ...base, type: 'contract' }, 'a1')).toBe(false)
    expect(canPublishDocumentToSite({ ...base, source: 'hoa', type: 'other' }, 'a1')).toBe(false)
    expect(canPublishDocumentToSite({ ...base, source: 'hoa', type: 'other', visibleToOwners: true }, 'a1')).toBe(true)
    expect(canPublishDocumentToSite({ ...base, visibleToOwners: true, aiGenerated: true }, 'a1')).toBe(false)
  })
  it('keeps to the page association, while organization-wide documents stay', () => {
    expect(canPublishDocumentToSite({ ...base, associationId: 'a1' }, 'a1')).toBe(true)
    expect(canPublishDocumentToSite({ ...base, associationId: 'a2' }, 'a1')).toBe(false)
    expect(canPublishDocumentToSite({ ...base, associationId: null }, 'a1')).toBe(true)
  })
})

describe('sensitive text hints', () => {
  it('flags emails, phones, dollar amounts and street addresses', () => {
    expect(sensitiveHints('write jane@home.test')).toEqual(['an email address'])
    expect(sensitiveHints('call 404-555-0182')).toEqual(['a phone number'])
    expect(sensitiveHints('you owe $120')).toEqual(['a dollar amount'])
    expect(sensitiveHints('visit 12 Oak Lane today')).toEqual(['a street address'])
  })
  it('passes plain notices', () => {
    expect(sensitiveHints('The pool opens May 1. Annual meeting is in June.')).toEqual([])
  })
})

describe('slugs and text', () => {
  it('makes and validates slugs', () => {
    expect(slugify("Oak Hollow & Pines HOA")).toBe('oak-hollow-and-pines-hoa')
    expect(validateSlug('oak-hollow')).toBeNull()
    expect(validateSlug('a')).not.toBeNull()
    expect(validateSlug('-bad-')).not.toBeNull()
    expect(validateSlug('admin')).not.toBeNull()
  })
  it('turns html into plain text without tags or scripts', () => {
    expect(htmlToPlainText('<p>Hello&nbsp;<b>all</b></p><script>x()</script><p>Bye</p>')).toBe('Hello all\nBye')
  })
})
