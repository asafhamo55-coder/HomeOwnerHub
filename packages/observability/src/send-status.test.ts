import { describe, expect, it } from 'vitest'
import { finalSendStatus, heldBySafetyGuard } from './send-status'

describe('finalSendStatus (BL-044)', () => {
  it('any delivery is sent', () => {
    expect(finalSendStatus({ sent: 1, failed: 3, held: 2 })).toBe('sent')
  })

  it('held for every recipient is not failed', () => {
    expect(finalSendStatus({ sent: 0, failed: 0, held: 4 })).toBe('cancelled')
  })

  it('a real failure with nothing delivered stays failed, held or not', () => {
    expect(finalSendStatus({ sent: 0, failed: 1, held: 4 })).toBe('failed')
    expect(finalSendStatus({ sent: 0, failed: 2, held: 0 })).toBe('failed')
  })

  it('nothing attempted at all is failed, as before', () => {
    expect(finalSendStatus({ sent: 0, failed: 0, held: 0 })).toBe('failed')
  })
})

describe('heldBySafetyGuard', () => {
  it('names a guard-held run', () => {
    expect(heldBySafetyGuard({ status: 'cancelled', sent: 0, failed: 0, held: 3 })).toBe(true)
  })

  it('a board-cancelled scheduled message has no held rows, so it is not "held"', () => {
    expect(heldBySafetyGuard({ status: 'cancelled', sent: 0, failed: 0, held: 0 })).toBe(false)
  })

  it('a failed or sent message is never "held"', () => {
    expect(heldBySafetyGuard({ status: 'failed', sent: 0, failed: 1, held: 3 })).toBe(false)
    expect(heldBySafetyGuard({ status: 'sent', sent: 1, failed: 0, held: 3 })).toBe(false)
  })
})
