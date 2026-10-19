import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-082: board actions hand the notice to after(), so the board's save
 * returns first, and a scheduling failure never reaches the action.
 * Nothing here sends: the runner is mocked.
 */

const afterMock = vi.fn()
vi.mock('next/server', () => ({ after: (fn: () => unknown) => afterMock(fn) }))
const run = vi.fn(async () => ({ status: 'off', communicationId: null, sent: 0, failed: 0 }))
vi.mock('./run', () => ({ runResidentNotification: run }))
vi.mock('./deps', () => ({ residentNotifyDeps: {} }))

const event = { kind: 'ticket_reply' as const, ticketId: 't-1', messageId: 'm-1', reply: 'Fixed.' }
const db = { from: vi.fn() }

describe('notifyResidentAfterResponse', () => {
  beforeEach(() => {
    afterMock.mockReset()
    run.mockClear()
  })

  it('schedules the runner after the response, not inline', async () => {
    const { notifyResidentAfterResponse } = await import('./notify')
    notifyResidentAfterResponse(db, event)
    expect(run).not.toHaveBeenCalled()
    expect(afterMock).toHaveBeenCalledTimes(1)
    await afterMock.mock.calls[0][0]()
    expect(run).toHaveBeenCalledTimes(1)
    expect((run.mock.calls[0] as unknown[])[2]).toEqual(event)
  })

  it('never throws when scheduling fails, and logs no body', async () => {
    afterMock.mockImplementation(() => {
      throw new Error('outside request scope')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { notifyResidentAfterResponse } = await import('./notify')
    expect(() => notifyResidentAfterResponse(db, event)).not.toThrow()
    expect(JSON.stringify(err.mock.calls)).not.toContain('Fixed.')
    err.mockRestore()
  })
})
