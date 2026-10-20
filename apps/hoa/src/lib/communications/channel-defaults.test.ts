import { describe, expect, it } from 'vitest'
import {
  categoryForUrgency,
  channelsSentence,
  defaultChannels,
  pickChannels,
  urgencyForCategory,
} from './channel-defaults'
import { BUILT_IN_TEMPLATES } from './built-in-templates'

// BL-102 A6: channels follow urgency; texting only when set up; a board's
// own choice is never silently overwritten.

describe('defaultChannels', () => {
  it('routine goes by email and portal, never text', () => {
    expect(defaultChannels({ urgency: 'routine', smsConfigured: true })).toEqual(['email', 'portal'])
  })

  it('urgent adds a text when texting is set up', () => {
    expect(defaultChannels({ urgency: 'urgent', smsConfigured: true })).toEqual(['email', 'portal', 'sms'])
  })

  it('urgent without texting set up stays on email and portal', () => {
    expect(defaultChannels({ urgency: 'urgent', smsConfigured: false })).toEqual(['email', 'portal'])
  })
})

describe('urgency and category', () => {
  it('only an emergency is urgent', () => {
    expect(urgencyForCategory('emergency')).toBe('urgent')
    for (const c of ['announcement', 'dues', 'meeting', 'welcome', 'community']) {
      expect(urgencyForCategory(c)).toBe('routine')
    }
  })

  it('urgent files as an emergency; routine returns an emergency to an announcement', () => {
    expect(categoryForUrgency('dues', 'urgent')).toBe('emergency')
    expect(categoryForUrgency('emergency', 'routine')).toBe('announcement')
    expect(categoryForUrgency('meeting', 'routine')).toBe('meeting')
  })

  it('every built-in emergency template is urgent', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(urgencyForCategory(t.category) === 'urgent', t.id).toBe(t.category === 'emergency')
    }
  })
})

describe('pickChannels', () => {
  it('untouched: follows urgency, and a template can add a channel', () => {
    expect(
      pickChannels({ urgency: 'routine', smsConfigured: true, current: ['email', 'portal'], touched: false, templateChannels: ['email', 'sms'] }),
    ).toEqual({ channels: ['email', 'portal', 'sms'], kept: false })
  })

  it('a template never adds a text when texting is not set up', () => {
    expect(
      pickChannels({ urgency: 'urgent', smsConfigured: false, current: [], touched: false, templateChannels: ['sms'] })
        .channels,
    ).toEqual(['email', 'portal'])
  })

  it('touched: keeps the board’s own choice over a template pick or urgency switch', () => {
    expect(
      pickChannels({ urgency: 'urgent', smsConfigured: true, current: ['email'], touched: true, templateChannels: ['portal'] }),
    ).toEqual({ channels: ['email'], kept: true })
  })

  it('touched but empty falls back to the defaults rather than nothing', () => {
    expect(pickChannels({ urgency: 'routine', smsConfigured: true, current: [], touched: true }).channels).toEqual([
      'email',
      'portal',
    ])
  })

  it('touched: drops a text the HOA cannot send', () => {
    expect(pickChannels({ urgency: 'urgent', smsConfigured: false, current: ['sms', 'email'], touched: true }).channels).toEqual([
      'email',
    ])
  })
})

describe('channelsSentence', () => {
  it('reads in plain words, text first', () => {
    expect(channelsSentence(['email', 'portal', 'sms'])).toBe('Text, email and portal')
    expect(channelsSentence(['email', 'portal'])).toBe('Email and portal')
    expect(channelsSentence(['email'])).toBe('Email')
    expect(channelsSentence([])).toBe('No channel')
  })
})
