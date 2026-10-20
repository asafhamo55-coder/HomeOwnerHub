import { describe, expect, it } from 'vitest'
import { domainOf, domainsAligned, senderAuthVerdict, toSenderAuthVerdict } from './auth-results'

const FROM = 'pat@example.test'

describe('senderAuthVerdict', () => {
  it('passes a real Gmail header with dmarc=pass', () => {
    const h =
      'mx.google.com; dkim=pass header.i=@example.test header.s=s1 header.b=abc; ' +
      'spf=pass (google.com: domain of pat@example.test designates 1.2.3.4 as permitted sender) smtp.mailfrom=pat@example.test; ' +
      'dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.test'
    expect(senderAuthVerdict([h], FROM)).toBe('pass')
  })

  it('fails on dmarc=fail even when spf passed for another domain', () => {
    const h =
      'mx.google.com; spf=pass smtp.mailfrom=bounce@attacker.test; dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=example.test'
    expect(senderAuthVerdict([h], FROM)).toBe('fail')
  })

  it('only trusts the TOPMOST header: a forged pass further down is ignored', () => {
    const real = 'mx.google.com; spf=softfail smtp.mailfrom=x@attacker.test; dkim=none'
    const forged = 'mx.google.com; dmarc=pass header.from=example.test'
    expect(senderAuthVerdict([real, forged], FROM)).toBe('fail')
  })

  it('is none when the topmost header is from an untrusted server, even if a trusted one follows', () => {
    const forgedTop = 'mail.attacker.test; dmarc=pass header.from=example.test'
    const below = 'mx.google.com; dmarc=pass header.from=example.test'
    expect(senderAuthVerdict([forgedTop, below], FROM)).toBe('none')
  })

  it('is none with no header at all', () => {
    expect(senderAuthVerdict([], FROM)).toBe('none')
  })

  it('is none for "authserv-id; none"', () => {
    expect(senderAuthVerdict(['mx.google.com; none'], FROM)).toBe('none')
  })

  it('passes an aligned dkim=pass with no dmarc record', () => {
    expect(senderAuthVerdict(['mx.google.com; dkim=pass header.d=example.test; spf=neutral'], FROM)).toBe('pass')
  })

  it('accepts a parent-domain signature (relaxed alignment)', () => {
    expect(senderAuthVerdict(['mx.google.com; dkim=pass header.d=example.test'], 'pat@mail.example.test')).toBe('pass')
  })

  it('does not count a pass signed by an unrelated domain', () => {
    expect(senderAuthVerdict(['mx.google.com; dkim=pass header.d=attacker.test; spf=none'], FROM)).toBe('none')
  })

  it('does not count a child-domain signature for a parent From', () => {
    expect(senderAuthVerdict(['mx.google.com; dkim=pass header.d=evil.example.test'], FROM)).toBe('none')
  })

  it('passes an aligned spf=pass', () => {
    expect(senderAuthVerdict(['mx.google.com; spf=pass smtp.mailfrom=pat@example.test'], FROM)).toBe('pass')
  })

  it('fails on spf=fail with no aligned pass', () => {
    expect(senderAuthVerdict(['mx.google.com; spf=fail smtp.mailfrom=pat@example.test; dkim=none'], FROM)).toBe('fail')
  })

  it('fails on dkim=fail with no aligned pass', () => {
    expect(senderAuthVerdict(['mx.google.com; dkim=fail header.d=example.test'], FROM)).toBe('fail')
  })

  it('an aligned dkim pass outranks an spf softfail (forwarded mail)', () => {
    expect(
      senderAuthVerdict(['mx.google.com; dkim=pass header.d=example.test; spf=softfail smtp.mailfrom=fwd@list.test'], FROM),
    ).toBe('pass')
  })

  it('treats temperror / neutral / dmarc=none as none', () => {
    expect(senderAuthVerdict(['mx.google.com; dmarc=none; spf=neutral; dkim=temperror'], FROM)).toBe('none')
  })

  it('ignores comments that contain fake results', () => {
    expect(senderAuthVerdict(['mx.google.com; spf=neutral (dmarc=pass; dkim=pass header.d=example.test)'], FROM)).toBe(
      'none',
    )
  })

  it('is case-insensitive on authserv-id, methods and results', () => {
    expect(senderAuthVerdict(['MX.Google.COM; DMARC=PASS header.from=example.test'], FROM)).toBe('pass')
  })

  it('accepts a version number after the authserv-id and on a method', () => {
    expect(senderAuthVerdict(['mx.google.com 1; dkim/1=pass header.d=example.test'], FROM)).toBe('pass')
  })

  it('honours a custom trusted list', () => {
    const h = 'gw.hoa.test; dmarc=pass'
    expect(senderAuthVerdict([h], FROM)).toBe('none')
    expect(senderAuthVerdict([h], FROM, ['gw.hoa.test'])).toBe('pass')
  })

  it('without a From address, only dmarc can pass', () => {
    expect(senderAuthVerdict(['mx.google.com; dkim=pass header.d=example.test'], null)).toBe('none')
    expect(senderAuthVerdict(['mx.google.com; dmarc=pass'], null)).toBe('pass')
  })

  it('survives garbage', () => {
    expect(senderAuthVerdict([';;;'], FROM)).toBe('none')
    expect(senderAuthVerdict(['mx.google.com; ===; dkim'], FROM)).toBe('none')
  })
})

describe('domain helpers', () => {
  it('domainOf', () => {
    expect(domainOf('Pat@Mail.Example.test')).toBe('mail.example.test')
    expect(domainOf('@example.test')).toBe('example.test')
    expect(domainOf('example.test.')).toBe('example.test')
    expect(domainOf('localhost')).toBeNull()
    expect(domainOf(null)).toBeNull()
  })
  it('domainsAligned', () => {
    expect(domainsAligned('a.example.test', 'example.test')).toBe(true)
    expect(domainsAligned('example.test', 'a.example.test')).toBe(false)
    expect(domainsAligned('a.example.test', 'b.example.test')).toBe(false)
    expect(domainsAligned('example.test', 'test')).toBe(false)
    expect(domainsAligned('notexample.test', 'example.test')).toBe(false)
  })
  it('toSenderAuthVerdict', () => {
    expect(toSenderAuthVerdict('pass')).toBe('pass')
    expect(toSenderAuthVerdict('fail')).toBe('fail')
    expect(toSenderAuthVerdict(null)).toBe('none')
    expect(toSenderAuthVerdict('weird')).toBe('none')
  })
})
