import { describe, expect, it } from 'vitest'
import { messageIdsIn, recipientIdsFromMessageIds, recipientMessageId, senderDomain } from './message-id'

const ID = '0f1e2d3c-4b5a-4968-8776-655443322110'

describe('recipient Message-ID', () => {
  it('builds <hoh-cr.{id}@{EMAIL_FROM domain}>', () => {
    expect(recipientMessageId(ID, 'HomeownerHub <noreply@HomeownerLedger.com>')).toBe(
      `<hoh-cr.${ID}@homeownerledger.com>`,
    )
    expect(recipientMessageId(ID, 'noreply@mail.example.org')).toBe(`<hoh-cr.${ID}@mail.example.org>`)
  })

  it('returns null (no header) for a non-uuid id or an unusable From', () => {
    expect(recipientMessageId('rcpt-1', 'a@b.com')).toBeNull()
    expect(recipientMessageId(ID, 'not an address')).toBeNull()
    expect(senderDomain('x@localhost')).toBeNull()
  })

  it('round-trips through In-Reply-To and a References chain', () => {
    const ours = recipientMessageId(ID, 'a@hoa.example')!
    expect(recipientIdsFromMessageIds(messageIdsIn(ours))).toEqual([ID])
    const refs = `<CAF=abc@mail.gmail.com>\r\n ${ours} <other@x.y>`
    expect(recipientIdsFromMessageIds(messageIdsIn(refs))).toEqual([ID])
  })

  it('ignores ids that only contain a uuid', () => {
    expect(recipientIdsFromMessageIds([`<${ID}@hoa.example>`, `<x-hoh-cr.${ID}@hoa.example>`, `hoh-cr.${ID}`])).toEqual([])
  })

  it('splits bare ids when no brackets are present', () => {
    expect(messageIdsIn('a@b c@d')).toEqual(['a@b', 'c@d'])
    expect(messageIdsIn(null)).toEqual([])
  })
})
