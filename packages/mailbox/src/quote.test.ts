import { describe, expect, it } from 'vitest'
import { stripQuotedReply } from './quote'

describe('stripQuotedReply', () => {
  it('returns text with no quoting unchanged', () => {
    expect(stripQuotedReply('Just a question about the pool.')).toBe(
      'Just a question about the pool.',
    )
  })

  it('strips the Gmail "On <date> <person> wrote:" attribution and everything after', () => {
    const body = [
      'The gate still is not working.',
      '',
      'On Mon, Jul 27, 2026 at 9:14 AM Madison Park HOA <board@mp.org> wrote:',
      '> Your new code is 4417.',
      '> Thanks',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('The gate still is not working.')
  })

  it('strips an Outlook "-----Original Message-----" block', () => {
    const body = [
      'Approved, go ahead.',
      '',
      '-----Original Message-----',
      'From: board@mp.org',
      'Sent: Monday, July 27, 2026',
      'Subject: Fence stain',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('Approved, go ahead.')
  })

  it('strips an Outlook "From:" header block', () => {
    const body = [
      'See below.',
      '',
      'From: Madison Park HOA <board@mp.org>',
      'Sent: Monday, July 27, 2026 9:14 AM',
      'To: Jenna Rivera',
      'Subject: Re: Pool gate',
      '',
      'Your new code is 4417.',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('See below.')
  })

  it('strips an Apple Mail attribution', () => {
    const body = [
      'Sounds good.',
      '',
      'On Jul 27, 2026, at 9:14 AM, Madison Park HOA <board@mp.org> wrote:',
      '',
      '> Original content',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('Sounds good.')
  })

  it('strips a leading run of ">" quoted lines when the reply is bottom-posted', () => {
    const body = ['> Your new code is 4417.', '> Thanks', '', 'That worked, thank you!'].join(
      '\n',
    )
    expect(stripQuotedReply(body)).toBe('That worked, thank you!')
  })

  it('strips a forwarded-message marker', () => {
    const body = ['FYI', '', '---------- Forwarded message ---------', 'From: x@y.com'].join(
      '\n',
    )
    expect(stripQuotedReply(body)).toBe('FYI')
  })

  it('trims trailing blank lines', () => {
    expect(stripQuotedReply('Hello.\n\n\n')).toBe('Hello.')
  })

  it('does NOT strip a line that merely contains the word wrote', () => {
    const body = 'I wrote to the vendor last week and never heard back.'
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('returns the original text when stripping would leave nothing', () => {
    // A pure top-quote with no new content — better to keep something
    // than to hand downstream an empty string.
    const body = ['> only quoted content', '> nothing new'].join('\n')
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('passes null through', () => {
    expect(stripQuotedReply(null)).toBeNull()
  })
})
