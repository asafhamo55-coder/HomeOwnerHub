import { describe, expect, it } from 'vitest'
import {
  CONTACT_SUBJECT,
  buildMyContact,
  changedFields,
  checkContactForm,
  formatContactRequest,
  formatInboxContactRequest,
  normalizePhone,
  parseContactRequest,
  parseTrustedContactRequest,
  trustContactChannel,
  planContactApply,
  readMailing,
  selfUpdateDates,
  withMailing,
  type ApplyContext,
} from './model'

describe('normalizePhone', () => {
  it('formats a 10-digit US number however it was typed', () => {
    expect(normalizePhone('5551234567')).toEqual({ ok: true, value: '(555) 123-4567' })
    expect(normalizePhone('555.123.4567')).toEqual({ ok: true, value: '(555) 123-4567' })
    expect(normalizePhone('+1 (555) 123-4567')).toEqual({ ok: true, value: '(555) 123-4567' })
    expect(normalizePhone('1-555-123-4567')).toEqual({ ok: true, value: '(555) 123-4567' })
  })
  it('empty is "no phone"', () => {
    expect(normalizePhone('  ')).toEqual({ ok: true, value: null })
  })
  it('refuses anything that is not a dialable US number', () => {
    for (const bad of ['555-1234', '12345678901234', 'call me', '2-555-123-4567', '555 123 4567 x9']) {
      expect(normalizePhone(bad).ok, bad).toBe(false)
    }
  })
})

describe('checkContactForm', () => {
  const ok = { phone: '555 123 4567', email: 'Pat@Example.com ', mailing: 'PO Box 1, Town, FL 33000' }
  it('normalizes every field', () => {
    expect(checkContactForm(ok)).toEqual({
      ok: true,
      values: { phone: '(555) 123-4567', email: 'pat@example.com', mailing: 'PO Box 1, Town, FL 33000' },
    })
  })
  it('an empty mailing address means "same as the home"', () => {
    const r = checkContactForm({ ...ok, mailing: '   ' })
    expect(r.ok && r.values.mailing).toBeNull()
  })
  it('says what is wrong under each field', () => {
    const r = checkContactForm({ phone: '123', email: 'not-an-email', mailing: 'a\nb' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.fieldErrors).sort()).toEqual(['email', 'mailing', 'phone'])
    expect(r.fieldErrors.phone).toMatch(/10-digit/)
    expect(r.fieldErrors.email).toMatch(/valid email/)
    expect(r.fieldErrors.mailing).toMatch(/one line/)
  })
  it('an email cannot be cleared — notices need one', () => {
    const r = checkContactForm({ ...ok, email: '' }, { requireEmail: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.email).toMatch(/Keep an email/)
  })
  it('caps lengths', () => {
    const r = checkContactForm({ ...ok, mailing: 'x'.repeat(301), email: `${'a'.repeat(195)}@b.com` })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['email', 'mailing'])
  })
})

describe('changedFields', () => {
  const now = { phone: '(555) 123-4567', email: 'pat@example.com', mailing: null }
  it('ignores case in email and formatting in phone', () => {
    expect(changedFields(now, { phone: '(555) 123-4567', email: 'PAT@example.com', mailing: null })).toEqual([])
    expect(changedFields({ ...now, phone: '555-123-4567' }, now)).toEqual([])
  })
  it('lists each changed field with from and to', () => {
    expect(changedFields(now, { phone: null, email: 'new@example.com', mailing: 'PO Box 9' })).toEqual([
      { field: 'phone', from: '(555) 123-4567', to: null },
      { field: 'email', from: 'pat@example.com', to: 'new@example.com' },
      { field: 'mailing', from: null, to: 'PO Box 9' },
    ])
  })
  it('skips fields the resident may not change', () => {
    expect(changedFields(now, { phone: null, email: 'new@example.com', mailing: 'PO Box 9' }, ['phone'])).toEqual([
      { field: 'phone', from: '(555) 123-4567', to: null },
    ])
  })
})

describe('request text round-trip', () => {
  it('formats a readable request and parses it back', () => {
    const changes = [
      { field: 'phone' as const, from: null, to: '(555) 123-4567' },
      { field: 'email' as const, from: 'old@example.com', to: 'new@example.com' },
      { field: 'mailing' as const, from: 'PO Box 1', to: null },
    ]
    const text = formatContactRequest(changes, 'Login@Example.com')
    expect(text).toContain('Phone: (555) 123-4567')
    expect(text).toContain('Email for notices: new@example.com')
    expect(text).toContain('Mailing address: (same as the home)')
    expect(text).toContain('Signed in as: login@example.com')
    expect(parseContactRequest(CONTACT_SUBJECT, text)).toEqual({
      signInEmail: 'login@example.com',
      changes: { phone: '(555) 123-4567', email: 'new@example.com', mailing: null },
    })
  })
  it('a removed phone round-trips as null', () => {
    const text = formatContactRequest([{ field: 'phone', from: '(555) 123-4567', to: null }], 'a@b.co')
    expect(text).toContain('Phone: (remove)')
    expect(parseContactRequest(CONTACT_SUBJECT, text)?.changes).toEqual({ phone: null })
  })
  it('is not a contact request without the subject, a sign-in line or any change', () => {
    const text = formatContactRequest([{ field: 'phone', from: null, to: '(555) 123-4567' }], 'a@b.co')
    expect(parseContactRequest('Broken gate', text)).toBeNull()
    expect(parseContactRequest(CONTACT_SUBJECT, 'Phone: (555) 123-4567')).toBeNull()
    expect(parseContactRequest(CONTACT_SUBJECT, 'Signed in as: a@b.co')).toBeNull()
  })
  it('re-validates values, so a hand-made ticket cannot smuggle a bad one', () => {
    const forged = 'Phone: 12\nEmail for notices: nope\nMailing address: ok street\nSigned in as: a@b.co'
    expect(parseContactRequest(CONTACT_SUBJECT, forged)).toEqual({ signInEmail: 'a@b.co', changes: { mailing: 'ok street' } })
  })
})

describe('mailing note', () => {
  it('reads the "Mailing address:" line record-sale and import write', () => {
    expect(readMailing('Mailing address: 9 Elsewhere Rd, Far, CA 90000')).toBe('9 Elsewhere Rd, Far, CA 90000')
    expect(readMailing('Gate code on file\nMailing address: PO Box 1')).toBe('PO Box 1')
    expect(readMailing('owner · Mailing address: PO Box 2')).toBe('PO Box 2')
    expect(readMailing('Nothing here')).toBeNull()
    expect(readMailing(null)).toBeNull()
  })
  it('replaces the line and keeps every other note', () => {
    expect(withMailing('Gate code on file\nMailing address: PO Box 1', 'PO Box 9')).toBe('Gate code on file\nMailing address: PO Box 9')
    expect(withMailing('Gate code on file', 'PO Box 9')).toBe('Gate code on file\nMailing address: PO Box 9')
    expect(withMailing(null, 'PO Box 9')).toBe('Mailing address: PO Box 9')
  })
  it('removing it leaves the other notes (or nothing)', () => {
    expect(withMailing('Gate code on file\nMailing address: PO Box 1', null)).toBe('Gate code on file')
    expect(withMailing('Mailing address: PO Box 1', null)).toBeNull()
    expect(withMailing('owner · Mailing address: PO Box 2', null)).toBe('owner')
  })
})

describe('buildMyContact (the resident’s own records, as RLS shows them)', () => {
  const unit = { unit_id: 'u1', unit_number: null, address: '12 Oak Street' }
  it('prefers the resident row and says what can be changed', () => {
    const c = buildMyContact({
      unit,
      propertyId: 'p1',
      residents: [{ id: 'r1', property_id: 'p1', email: 'pat@example.com', phone: '(555) 123-4567', notes: 'Mailing address: PO Box 1' }],
      ownerships: [{ id: 'o1', unit_id: 'u1', owner_email: 'pat@example.com', owner_phone: null }],
      tenancies: [],
      pending: null,
    })
    expect(c.current).toEqual({ phone: '(555) 123-4567', email: 'pat@example.com', mailing: 'PO Box 1' })
    expect(c.editable).toEqual(['phone', 'email', 'mailing'])
    expect(c.label).toBe('12 Oak Street')
  })
  it('email is locked when sign-in rests on the email on file (no linked ownership or lease)', () => {
    const c = buildMyContact({
      unit,
      propertyId: 'p1',
      residents: [{ id: 'r1', property_id: 'p1', email: 'pat@example.com', phone: null, notes: null }],
      ownerships: [],
      tenancies: [],
      pending: null,
    })
    expect(c.editable).toEqual(['phone', 'mailing'])
    expect(c.emailLocked).toBe(true)
  })
  it('falls back to the linked ownership when no resident row is visible; mailing then can’t be shown', () => {
    const c = buildMyContact({
      unit,
      propertyId: 'p1',
      residents: [],
      ownerships: [{ id: 'o1', unit_id: 'u1', owner_email: 'notices@example.com', owner_phone: '(555) 000-1111' }],
      tenancies: [],
      pending: null,
    })
    expect(c.current).toEqual({ phone: '(555) 000-1111', email: 'notices@example.com', mailing: null })
    expect(c.editable).toEqual(['phone', 'email'])
    expect(c.mailingUnknown).toBe(true)
  })
  it('only counts rows for THIS home', () => {
    const c = buildMyContact({
      unit,
      propertyId: 'p1',
      residents: [{ id: 'r9', property_id: 'p9', email: 'pat@example.com', phone: '(555) 999-9999', notes: null }],
      ownerships: [{ id: 'o9', unit_id: 'u9', owner_email: 'x@example.com', owner_phone: null }],
      tenancies: [],
      pending: null,
    })
    expect(c.editable).toEqual([])
    expect(c.current).toEqual({ phone: null, email: null, mailing: null })
  })
})

describe('planContactApply', () => {
  const base: ApplyContext = {
    submitterId: 'user-1',
    request: { signInEmail: 'pat@example.com', changes: { phone: '(555) 222-3333', email: 'notices@example.com', mailing: 'PO Box 9' } },
    residents: [
      { id: 'r1', email: 'Pat@Example.com', phone: '(555) 123-4567', notes: 'Gate 1234\nMailing address: PO Box 1', full_name: 'Pat Example', role: 'owner' },
      { id: 'r2', email: 'sam@example.com', phone: null, notes: null, full_name: 'Sam Example', role: 'owner' },
    ],
    ownerships: [
      { id: 'o1', owner_user_id: 'user-1', owner_email: 'pat@example.com', owner_phone: '(555) 123-4567' },
      { id: 'o2', owner_user_id: null, owner_email: 'sam@example.com', owner_phone: null },
    ],
    tenancies: [],
    property: { owner_email: 'pat@example.com', owner_phone: '(555) 123-4567' },
  }

  it('changes only the submitter’s own rows, and keeps the lot in step', () => {
    const r = planContactApply(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.plan.residents).toEqual([
      {
        id: 'r1',
        patch: { phone: '(555) 222-3333', email: 'notices@example.com', notes: 'Gate 1234\nMailing address: PO Box 9' },
        before: { phone: '(555) 123-4567', email: 'Pat@Example.com', notes: 'Gate 1234\nMailing address: PO Box 1' },
      },
    ])
    expect(r.plan.ownerships).toEqual([
      {
        id: 'o1',
        patch: { owner_phone: '(555) 222-3333', owner_email: 'notices@example.com' },
        before: { owner_phone: '(555) 123-4567', owner_email: 'pat@example.com' },
      },
    ])
    expect(r.plan.property).toEqual({
      patch: { owner_phone: '(555) 222-3333', owner_email: 'notices@example.com' },
      before: { owner_phone: '(555) 123-4567', owner_email: 'pat@example.com' },
    })
    expect(r.plan.applied).toEqual(['phone', 'email', 'mailing'])
    expect(r.plan.held).toEqual([])
    expect(r.plan.names).toEqual(['Pat Example'])
  })

  it('holds the email when sign-in rests on it (no linked ownership or lease) — never locks them out', () => {
    const r = planContactApply({
      ...base,
      ownerships: [{ id: 'o1', owner_user_id: null, owner_email: 'pat@example.com', owner_phone: null }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.plan.held).toEqual(['email'])
    expect(r.plan.applied).toEqual(['phone', 'mailing'])
    expect(r.plan.residents[0]!.patch).not.toHaveProperty('email')
    expect(r.plan.ownerships[0]!.patch).toEqual({ owner_phone: '(555) 222-3333' })
  })

  it('a linked lease keeps sign-in safe too, and the lease gets the new contact', () => {
    const r = planContactApply({
      ...base,
      ownerships: [],
      property: null,
      tenancies: [{ id: 't1', tenant_user_id: 'user-1', tenant_email: 'pat@example.com', tenant_phone: null }],
    })
    expect(r.ok && r.plan.held).toEqual([])
    expect(r.ok && r.plan.tenancies).toEqual([
      { id: 't1', patch: { tenant_phone: '(555) 222-3333', tenant_email: 'notices@example.com' }, before: { tenant_phone: null, tenant_email: 'pat@example.com' } },
    ])
  })

  it('holds the mailing address when there is no resident row to keep it on', () => {
    const r = planContactApply({ ...base, residents: [] })
    expect(r.ok && r.plan.held).toEqual(['mailing'])
  })

  it('leaves another owner’s ownership and the property alone when they are not the submitter', () => {
    const r = planContactApply({ ...base, property: { owner_email: 'sam@example.com', owner_phone: null } })
    expect(r.ok && r.plan.property).toBeNull()
    expect(r.ok && r.plan.ownerships.map((o) => o.id)).toEqual(['o1'])
  })

  it('never touches an ownership linked to somebody else, even with the same email', () => {
    const r = planContactApply({
      ...base,
      ownerships: [{ id: 'o3', owner_user_id: 'user-2', owner_email: 'pat@example.com', owner_phone: null }],
    })
    expect(r.ok && r.plan.ownerships).toEqual([])
  })

  it('refuses when nothing on the home belongs to the submitter', () => {
    const r = planContactApply({ ...base, request: { ...base.request, signInEmail: 'stranger@example.com' }, ownerships: [] , property: null})
    expect(r.ok).toBe(false)
  })

  it('refuses when every requested change is held', () => {
    const r = planContactApply({
      ...base,
      request: { signInEmail: 'pat@example.com', changes: { email: 'n@example.com' } },
      ownerships: [],
      property: null,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/sign/)
  })

  it('skips a patch that changes nothing', () => {
    const r = planContactApply({
      ...base,
      request: { signInEmail: 'pat@example.com', changes: { phone: '(555) 123-4567' } },
    })
    expect(r.ok && r.plan.residents).toEqual([])
    expect(r.ok && r.plan.ownerships).toEqual([])
  })
})

describe('selfUpdateDates', () => {
  it('maps every resident and ownership id to its latest self-update', () => {
    const m = selfUpdateDates([
      { created_at: '2026-10-01T10:00:00Z', metadata: { residentIds: ['r1'], ownershipIds: ['o1'] } },
      { created_at: '2026-10-05T10:00:00Z', metadata: { residentIds: ['r1'], ownershipIds: [] } },
      { created_at: '2026-10-03T10:00:00Z', metadata: 'garbage' },
    ])
    expect(m).toEqual({ r1: '2026-10-05T10:00:00Z', o1: '2026-10-01T10:00:00Z' })
  })
})

describe('Inbox-filed requests (BL-101 A4)', () => {
  it('round-trips with the sender as the key and channel inbox; values only, never removals', () => {
    const text = formatInboxContactRequest(
      [
        { field: 'phone', from: null, to: '(555) 222-3333' },
        { field: 'mailing', from: 'PO Box 1', to: null },
      ],
      'Pat@Example.com',
    )
    expect(text).toContain('Emailed in by: pat@example.com')
    expect(text).not.toContain('Mailing address')
    expect(parseContactRequest(CONTACT_SUBJECT, text)).toEqual({
      signInEmail: 'pat@example.com',
      changes: { phone: '(555) 222-3333' },
      channel: 'inbox',
    })
  })

  it('an "Emailed in by" line wins over a "Signed in as" one (the narrower reading)', () => {
    const text = 'Phone: (555) 222-3333\nSigned in as: board@example.com\nEmailed in by: pat@example.com'
    expect(parseContactRequest(CONTACT_SUBJECT, text)).toMatchObject({ signInEmail: 'pat@example.com', channel: 'inbox' })
  })

  const ctx: ApplyContext = {
    // The board member who filed it.
    submitterId: 'board-1',
    request: { signInEmail: 'pat@example.com', changes: { phone: '(555) 222-3333', email: 'new@example.com' }, channel: 'inbox' },
    residents: [{ id: 'r1', email: 'pat@example.com', phone: null, notes: null, full_name: 'Pat Example', role: 'owner' }],
    ownerships: [
      // Linked to the board member's own account: must never be selected by it.
      { id: 'o-board', owner_user_id: 'board-1', owner_email: 'board@example.com', owner_phone: null },
      { id: 'o-pat', owner_user_id: null, owner_email: 'pat@example.com', owner_phone: null },
    ],
    tenancies: [],
    property: null,
  }

  it('never uses the filing board member’s account as a key', () => {
    const r = planContactApply(ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.plan.ownerships.map((o) => o.id)).toEqual(['o-pat'])
    expect(r.plan.residents.map((x) => x.id)).toEqual(['r1'])
  })

  it('always holds an email change (no linked access to keep sign-in safe)', () => {
    const r = planContactApply(ctx)
    expect(r.ok && r.plan.held).toEqual(['email'])
    expect(r.ok && r.plan.applied).toEqual(['phone'])
  })

  it('refuses when the sender names nobody on the home', () => {
    expect(planContactApply({ ...ctx, request: { ...ctx.request, signInEmail: 'board@example.com' }, residents: [] }).ok).toBe(false)
  })
})

describe('trustContactChannel — the Inbox claim needs a board/admin submitter', () => {
  const filed = formatInboxContactRequest([{ field: 'phone', from: null, to: '(555) 222-3333' }], 'pat@example.com')
  const forged = `${filed}\nSigned in as: sam@example.com`

  it('keeps the channel for a board submitter', () => {
    expect(parseTrustedContactRequest(CONTACT_SUBJECT, filed, true)).toEqual({
      signInEmail: 'pat@example.com',
      changes: { phone: '(555) 222-3333' },
      channel: 'inbox',
    })
  })

  it('drops the channel and falls back to the resident’s own "Signed in as" line', () => {
    const r = parseTrustedContactRequest(CONTACT_SUBJECT, forged, false)
    expect(r).toEqual({ signInEmail: 'sam@example.com', changes: { phone: '(555) 222-3333' } })
    expect(r).not.toHaveProperty('channel')
  })

  it('a board submitter’s body never carries the fallback field onward', () => {
    expect(parseTrustedContactRequest(CONTACT_SUBJECT, forged, true)).not.toHaveProperty('signedInAs')
  })

  it('no "Signed in as" line from a non-board submitter = not a readable request', () => {
    expect(parseTrustedContactRequest(CONTACT_SUBJECT, filed, false)).toBeNull()
  })

  it('leaves ordinary portal requests untouched either way', () => {
    const own = formatContactRequest([{ field: 'phone', from: null, to: '(555) 222-3333' }], 'sam@example.com')
    const parsed = parseContactRequest(CONTACT_SUBJECT, own)!
    expect(trustContactChannel(parsed, false)).toBe(parsed)
    expect(trustContactChannel(parsed, true)).toBe(parsed)
  })

  it('a forged request does not unlock the resident-held planning: the submitter’s own account is the key again', () => {
    const request = parseTrustedContactRequest(CONTACT_SUBJECT, forged, false)!
    const r = planContactApply({
      request,
      submitterId: 'user-sam',
      residents: [{ id: 'r-sam', email: 'sam@example.com', phone: null, notes: null, full_name: 'Sam', role: 'owner' }],
      ownerships: [
        { id: 'o-sam', owner_user_id: 'user-sam', owner_email: 'sam@example.com', owner_phone: null },
        { id: 'o-pat', owner_user_id: null, owner_email: 'pat@example.com', owner_phone: null },
      ],
      tenancies: [],
      property: null,
    })
    expect(r.ok && r.plan.ownerships.map((o) => o.id)).toEqual(['o-sam'])
  })
})
