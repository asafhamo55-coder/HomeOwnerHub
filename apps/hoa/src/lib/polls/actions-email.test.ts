import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendPollEmailNow = vi.fn()
const setPollStatus = vi.fn()
const getPoll = vi.fn()
const getResults = vi.fn()
const gate = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: (...a: unknown[]) => gate(...a),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => ({ marker: 'board-client' }) }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => null }))
vi.mock('@/lib/resident', () => ({ getResidentUnits: async () => [] }))
vi.mock('./email/notify', () => ({ sendPollEmailNow: (...a: unknown[]) => sendPollEmailNow(...a) }))
vi.mock('./store', async (orig) => ({
  ...(await orig<typeof import('./store')>()),
  setPollStatus: (...a: unknown[]) => setPollStatus(...a),
  getPoll: (...a: unknown[]) => getPoll(...a),
  getResults: (...a: unknown[]) => getResults(...a),
}))

import { closePollAction, openPollAction } from './actions'

const ID = '11111111-1111-4111-8111-111111111111'
const ASSOC = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  for (const m of [sendPollEmailNow, setPollStatus, getPoll, getResults, gate]) m.mockReset()
  gate.mockResolvedValue({ ok: true, orgId: 'org' })
  setPollStatus.mockResolvedValue({ ok: true, data: null })
  getPoll.mockResolvedValue({ ok: true, data: { poll: { id: ID, association_id: ASSOC }, options: [] } })
  getResults.mockResolvedValue({ ok: true, data: [] })
  sendPollEmailNow.mockResolvedValue({ status: 'sent', sent: 5, failed: 0, held: 0, optedOut: 1, communicationId: 'c' })
})

describe('openPollAction', () => {
  it('opens the poll and emails residents when the box is ticked', async () => {
    const r = await openPollAction(ID, { emailResidents: true })
    expect(setPollStatus).toHaveBeenCalledWith(expect.anything(), ID, 'open')
    expect(sendPollEmailNow).toHaveBeenCalledTimes(1)
    expect(sendPollEmailNow.mock.calls[0]![2]).toEqual({ kind: 'opened', pollId: ID, associationId: ASSOC })
    expect(r).toEqual({ ok: true, id: ID, email: { status: 'sent', sent: 5, held: 0, optedOut: 1 } })
  })

  it('sends nothing when the box is not ticked, or the option is left out', async () => {
    for (const opts of [{ emailResidents: false }, {}, undefined]) {
      sendPollEmailNow.mockClear()
      const r = await openPollAction(ID, opts)
      expect(r).toEqual({ ok: true, id: ID })
      expect(sendPollEmailNow).not.toHaveBeenCalled()
    }
  })

  it('sends nothing when the poll could not be opened', async () => {
    setPollStatus.mockResolvedValue({ ok: false, error: 'no' })
    const r = await openPollAction(ID, { emailResidents: true })
    expect(r.ok).toBe(false)
    expect(sendPollEmailNow).not.toHaveBeenCalled()
  })

  it('only a board member or admin can trigger it', async () => {
    gate.mockResolvedValue({ ok: false, error: 'denied' })
    expect(await openPollAction(ID, { emailResidents: true })).toEqual({ ok: false, error: 'denied' })
    expect(setPollStatus).not.toHaveBeenCalled()
    expect(sendPollEmailNow).not.toHaveBeenCalled()
  })

  it('an email problem never undoes the open: ok comes back with the outcome', async () => {
    sendPollEmailNow.mockResolvedValue({ status: 'failed', sent: 0, failed: 5, held: 0, optedOut: 0, communicationId: 'c' })
    const r = await openPollAction(ID, { emailResidents: true })
    expect(r).toMatchObject({ ok: true, email: { status: 'failed' } })
  })

  it('rejects a poll id that is not a uuid', async () => {
    expect(await openPollAction('nope', { emailResidents: true })).toEqual({ ok: false, error: 'Invalid poll.' })
    expect(sendPollEmailNow).not.toHaveBeenCalled()
  })
})

describe('closePollAction', () => {
  it('closes and emails the results only when asked, reading the tally for the board', async () => {
    const r = await closePollAction(ID, { emailResidents: true })
    expect(setPollStatus).toHaveBeenCalledWith(expect.anything(), ID, 'closed')
    expect(sendPollEmailNow.mock.calls[0]![2]).toEqual({ kind: 'results', pollId: ID, associationId: ASSOC })
    expect(r).toMatchObject({ ok: true, email: { status: 'sent', sent: 5 } })
    // The tally loader passed in reads poll_results() through the board's client.
    await sendPollEmailNow.mock.calls[0]![1](ID)
    expect(getResults).toHaveBeenCalledWith(expect.anything(), ID)

    sendPollEmailNow.mockClear()
    expect(await closePollAction(ID)).toEqual({ ok: true, id: ID })
    expect(sendPollEmailNow).not.toHaveBeenCalled()
  })
})
