import { describe, expect, it } from 'vitest'
import { connectErrorRedirect, mailboxConnectErrorMessage } from './connect-errors'

describe('mailbox connect error codes', () => {
  it('maps each code the start route sends to words', () => {
    expect(mailboxConnectErrorMessage('forbidden')).toMatch(/Only an HOA admin/)
    expect(mailboxConnectErrorMessage('not_configured')).toMatch(/not set up/)
    expect(mailboxConnectErrorMessage('internal')).toMatch(/Try again/)
  })

  it('does not treat prototype keys as codes', () => {
    expect(mailboxConnectErrorMessage('toString')).toBe('toString')
  })

  it('appends the code without clobbering an existing query', () => {
    const url = connectErrorRedirect('/settings/mailbox?tab=a', 'internal', 'https://app.example/x')
    expect(url.toString()).toBe('https://app.example/settings/mailbox?tab=a&error=internal')
  })
})
