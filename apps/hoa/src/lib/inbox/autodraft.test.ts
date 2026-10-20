import { describe, expect, it } from 'vitest'
import { autoDraftEnabled, decideAutoDraft, type AutoDraftInput } from './autodraft'

/**
 * BL-101 A3 — draft-on-open fires once per thread version (the newest
 * inbound message) and never where an automatic draft could displace a
 * live one, re-answer a failed send, or spend on mail nobody needs to
 * answer.
 */
const base: AutoDraftInput = {
  enabledForOrg: true,
  vendorFiled: false,
  gmailState: 'active',
  threadStatus: 'needs_review',
  latestMessage: { id: 'msg-2', direction: 'inbound', sentAt: '2026-10-19T10:00:00.000Z' },
  latestDraft: null,
}

describe('decideAutoDraft', () => {
  it('drafts a thread with no draft whose newest message is inbound, keyed on that message', () => {
    expect(decideAutoDraft(base)).toEqual({ draft: true, version: 'msg-2' })
  })

  it('treats an unobserved Gmail state as visible', () => {
    expect(decideAutoDraft({ ...base, gmailState: 'unknown' }).draft).toBe(true)
  })

  it('does not re-spend on a reopen: a draft created after the newest inbound already answers it', () => {
    for (const status of ['sent', 'cancelled']) {
      expect(
        decideAutoDraft({ ...base, latestDraft: { status, createdAt: '2026-10-19T10:05:00.000Z' } }),
      ).toEqual({ draft: false, reason: 'already_drafted' })
    }
  })

  it('drafts again when the resident wrote after the last sent or cancelled draft (a new version)', () => {
    for (const status of ['sent', 'cancelled']) {
      expect(
        decideAutoDraft({ ...base, latestDraft: { status, createdAt: '2026-10-18T09:00:00.000Z' } }),
      ).toEqual({ draft: true, version: 'msg-2' })
    }
  })

  it('never displaces a live draft', () => {
    for (const status of ['draft', 'queued', 'sending']) {
      expect(
        decideAutoDraft({ ...base, latestDraft: { status, createdAt: '2026-10-18T09:00:00.000Z' } }),
      ).toEqual({ draft: false, reason: 'live_draft' })
    }
  })

  it('never drafts over a failed send — a new draft there is a human decision', () => {
    expect(
      decideAutoDraft({ ...base, latestDraft: { status: 'failed', createdAt: '2026-10-18T09:00:00.000Z' } }),
    ).toEqual({ draft: false, reason: 'failed_send' })
  })

  it('skips vendor threads, Gmail-filed or trashed threads, closed threads and org opt-outs', () => {
    expect(decideAutoDraft({ ...base, vendorFiled: true })).toEqual({ draft: false, reason: 'vendor_thread' })
    expect(decideAutoDraft({ ...base, gmailState: 'archived' })).toEqual({ draft: false, reason: 'filed_in_gmail' })
    expect(decideAutoDraft({ ...base, gmailState: 'trashed' })).toEqual({ draft: false, reason: 'filed_in_gmail' })
    expect(decideAutoDraft({ ...base, threadStatus: 'closed' })).toEqual({ draft: false, reason: 'closed' })
    expect(decideAutoDraft({ ...base, enabledForOrg: false })).toEqual({ draft: false, reason: 'disabled_for_org' })
  })

  it('skips when the board spoke last or there are no messages', () => {
    expect(
      decideAutoDraft({ ...base, latestMessage: { id: 'm', direction: 'outbound', sentAt: base.latestMessage!.sentAt } }),
    ).toEqual({ draft: false, reason: 'no_inbound' })
    expect(decideAutoDraft({ ...base, latestMessage: null })).toEqual({ draft: false, reason: 'no_inbound' })
  })
})

describe('autoDraftEnabled', () => {
  it('is on unless an association sets inbox_autodraft to exactly false', () => {
    expect(autoDraftEnabled([])).toBe(true)
    expect(autoDraftEnabled([{ compliance_settings: null }])).toBe(true)
    expect(autoDraftEnabled([{ compliance_settings: { inbox_autodraft: true } }])).toBe(true)
    expect(autoDraftEnabled([{ compliance_settings: { inbox_autodraft: 'false' } }])).toBe(true)
    expect(autoDraftEnabled([{ compliance_settings: {} }, { compliance_settings: { inbox_autodraft: false } }])).toBe(
      false,
    )
  })
})
