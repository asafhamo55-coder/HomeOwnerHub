import { describe, expect, it } from 'vitest'
import { decodeBase64Url, parseAddress, parseGmailMessage } from './parse'
import type { GmailApiMessage } from './parse'

import simple from './fixtures/simple.json'
import multipart from './fixtures/multipart.json'
import withAttachment from './fixtures/with-attachment.json'
import inlineImage from './fixtures/inline-image.json'
import nested from './fixtures/nested.json'
import edgeCases from './fixtures/edge-cases.json'

const as = (v: unknown): GmailApiMessage => v as GmailApiMessage

describe('decodeBase64Url', () => {
  it('decodes URL-safe base64 without padding', () => {
    // "<p>HTML version</p>" encoded with - and _ and no "="
    expect(decodeBase64Url('PHA-SFRNTCB2ZXJzaW9uPC9wPg')).toBe('<p>HTML version</p>')
  })

  it('returns empty string for empty input', () => {
    expect(decodeBase64Url('')).toBe('')
  })
})

describe('parseGmailMessage', () => {
  it('parses a plain-text message', () => {
    const m = parseGmailMessage(as(simple))
    expect(m.gmailMessageId).toBe('18f0a1b2c3d4e5f6')
    expect(m.gmailThreadId).toBe('18f0a1b2c3d4e5f0')
    expect(m.rfc822MessageId).toBe('<abc123@mail.gmail.com>')
    expect(m.fromEmail).toBe('j.rivera@gmail.com')
    expect(m.fromName).toBe('Jenna Rivera')
    expect(m.toEmails).toEqual(['board@madisonparkhoa.org'])
    expect(m.deliveredTo).toEqual(['board@madisonparkhoa.org'])
    expect(m.subject).toBe('Pool gate code not working')
    expect(m.bodyText).toContain('pool gate')
    expect(m.bodyHtml).toBeNull()
    expect(m.attachments).toEqual([])
    expect(m.sentAt).toBe(new Date(1785500000000).toISOString())
    expect(m.labelIds).toEqual(['INBOX', 'UNREAD'])
  })

  it('prefers text/plain but keeps text/html from a multipart message', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.bodyText).toBe('Plain text version')
    expect(m.bodyHtml).toBe('<p>HTML version</p>')
  })

  it('parses a quoted display name containing a comma', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.fromName).toBe('Chen, Mei')
    expect(m.fromEmail).toBe('mchen.home@yahoo.com')
  })

  it('splits multiple To recipients and reads Cc', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.toEmails).toEqual([
      'board@madisonparkhoa.org',
      'manager@madisonparkhoa.org',
    ])
    expect(m.ccEmails).toEqual(['d.okafor@gmail.com'])
  })

  it('reads threading headers', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.inReplyTo).toBe('<parent-1@mail.gmail.com>')
    expect(m.references).toEqual([
      '<root@mail.gmail.com>',
      '<parent-1@mail.gmail.com>',
    ])
  })

  it('extracts a real attachment', () => {
    const m = parseGmailMessage(as(withAttachment))
    expect(m.attachments).toHaveLength(1)
    expect(m.attachments[0]).toEqual({
      gmailAttachmentId: 'ANGjdJ_attach_1',
      fileName: 'invoice-4417.pdf',
      contentType: 'application/pdf',
      sizeBytes: 284913,
      isInline: false,
    })
  })

  it('flags an inline image as inline', () => {
    const m = parseGmailMessage(as(inlineImage))
    expect(m.attachments).toHaveLength(1)
    expect(m.attachments[0].isInline).toBe(true)
    expect(m.attachments[0].fileName).toBe('logo.gif')
  })

  it('walks nested multipart trees for both body and attachments', () => {
    const m = parseGmailMessage(as(nested))
    expect(m.bodyText).toBe('Nested plain')
    expect(m.bodyHtml).toBe('<p>Nested HTML</p>')
    expect(m.attachments).toHaveLength(1)
    expect(m.attachments[0].fileName).toBe('opinion.pdf')
  })

  it('survives a message with no payload at all', () => {
    const m = parseGmailMessage(as({ id: 'x', threadId: 'y' }))
    expect(m.gmailMessageId).toBe('x')
    expect(m.bodyText).toBeNull()
    expect(m.attachments).toEqual([])
    expect(m.toEmails).toEqual([])
  })

  it('populates strippedText from bodyText', () => {
    const m = parseGmailMessage(as(simple))
    expect(m.strippedText).toBe(m.bodyText)
  })

  it('leaves strippedText null when there is no text body', () => {
    const m = parseGmailMessage(as({ id: 'x', threadId: 'y' }))
    expect(m.strippedText).toBeNull()
  })

  it('splits a quoted comma-containing display name in To from the address after it (2, not 3)', () => {
    const m = parseGmailMessage(as(edgeCases))
    expect(m.toEmails).toHaveLength(2)
    expect(m.toEmails).toEqual(['m@x.com', 'other@y.com'])
  })

  it('collects every Delivered-To occurrence, not just the first', () => {
    const m = parseGmailMessage(as(edgeCases))
    expect(m.deliveredTo).toEqual([
      'board@madisonparkhoa.org',
      'hoa-board-group@googlegroups.com',
    ])
  })

  it('looks up headers case-insensitively (lowercase "subject")', () => {
    const m = parseGmailMessage(as(edgeCases))
    expect(m.subject).toBe('Fence stain color approval - fan out')
  })

  it('flags a part with only Content-ID (no Content-Disposition) as inline', () => {
    const m = parseGmailMessage(as(edgeCases))
    expect(m.attachments).toHaveLength(1)
    expect(m.attachments[0].fileName).toBe('sig.png')
    expect(m.attachments[0].isInline).toBe(true)
  })

  describe('sentAt derivation does not throw on out-of-range internalDate', () => {
    it('yields sentAt: null for a 20-digit out-of-range internalDate string', () => {
      const m = parseGmailMessage(
        as({ id: 'x', threadId: 'y', internalDate: '99999999999999999999' }),
      )
      expect(m.sentAt).toBeNull()
    })

    it('yields sentAt: null for a negative out-of-range internalDate', () => {
      const m = parseGmailMessage(
        as({ id: 'x', threadId: 'y', internalDate: '-99999999999999999999' }),
      )
      expect(m.sentAt).toBeNull()
    })

    it('yields sentAt: null for a non-numeric internalDate', () => {
      const m = parseGmailMessage(as({ id: 'x', threadId: 'y', internalDate: 'not-a-number' }))
      expect(m.sentAt).toBeNull()
    })

    it('yields sentAt: null when internalDate is absent', () => {
      const m = parseGmailMessage(as({ id: 'x', threadId: 'y' }))
      expect(m.sentAt).toBeNull()
    })
  })
})

describe('parseAddress', () => {
  it('parses a bare address', () => {
    expect(parseAddress('a@b.com')).toEqual({ email: 'a@b.com', name: null })
  })

  it('parses "Name <email>"', () => {
    expect(parseAddress('Name <a@b.com>')).toEqual({ email: 'a@b.com', name: 'Name' })
  })

  it('parses a quoted display name containing a comma', () => {
    expect(parseAddress('"Quoted, Name" <a@b.com>')).toEqual({
      email: 'a@b.com',
      name: 'Quoted, Name',
    })
  })

  it('yields email: null for an unclosed angle bracket', () => {
    const result = parseAddress('Jenna Rivera <j.rivera@gmail.com')
    expect(result.email).toBeNull()
  })

  it('yields email: null for a string with ">" but no "<"', () => {
    const result = parseAddress('j.rivera@gmail.com>')
    expect(result.email).toBeNull()
  })

  it('yields email: null for a bare-word non-address', () => {
    const result = parseAddress('notanemail')
    expect(result.email).toBeNull()
    expect(result.name).toBe('notanemail')
  })
})
