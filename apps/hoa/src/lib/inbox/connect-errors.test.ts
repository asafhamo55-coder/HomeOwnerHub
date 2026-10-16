import { describe, expect, it } from 'vitest'
import { CONNECT_ERROR_MESSAGES, ConnectError, connectErrorMessage, isConnectErrorCode } from './connect-errors'

describe('connectErrorMessage', () => {
  it('maps a known code to its message', () => {
    expect(connectErrorMessage('state_expired')).toBe(CONNECT_ERROR_MESSAGES.state_expired)
    expect(connectErrorMessage('access_denied')).toBe(CONNECT_ERROR_MESSAGES.access_denied)
  })

  it('never renders an unknown value verbatim', () => {
    expect(connectErrorMessage('Call 555-0100 to verify')).toBe(CONNECT_ERROR_MESSAGES.internal)
    expect(connectErrorMessage('constructor')).toBe(CONNECT_ERROR_MESSAGES.internal)
    expect(connectErrorMessage(undefined)).toBe(CONNECT_ERROR_MESSAGES.internal)
  })

  it('recognises only its own codes', () => {
    expect(isConnectErrorCode('invalid_state')).toBe(true)
    expect(isConnectErrorCode('toString')).toBe(false)
  })

  it('ConnectError carries the code alongside the server-side message', () => {
    const e = new ConnectError('forbidden', 'detail')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('forbidden')
    expect(e.message).toBe('detail')
  })
})
