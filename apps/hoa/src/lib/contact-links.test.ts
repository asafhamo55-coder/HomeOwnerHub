import { describe, expect, it } from 'vitest'
import { mailtoHref, telHref } from './contact-links'

describe('telHref', () => {
  it('dials the digits of a formatted US number', () => {
    expect(telHref('(555) 010-0128')).toBe('tel:5550100128')
  })
  it('keeps a leading + for international numbers', () => {
    expect(telHref('+44 20 7946 0000')).toBe('tel:+442079460000')
  })
  it('keeps an extension as a pause-free ;ext', () => {
    expect(telHref('555-010-0128 x12')).toBe('tel:5550100128;ext=12')
  })
  it('is null for something that is not a dialable number', () => {
    expect(telHref('call the office')).toBeNull()
    expect(telHref('12')).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref(null)).toBeNull()
  })
})

describe('mailtoHref', () => {
  it('links a plausible address', () => {
    expect(mailtoHref(' pat@example.test ')).toBe('mailto:pat@example.test')
  })
  it('is null for junk, so it renders as plain text', () => {
    expect(mailtoHref('not an email')).toBeNull()
    expect(mailtoHref(null)).toBeNull()
  })
})
