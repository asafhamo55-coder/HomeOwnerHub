import { describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  lastAnswerDayLabel,
  pollEmailCommunicationId,
  pollPortalPath,
  runPollEmail,
  type PollEmailContext,
  type PollEmailDeps,
  type PollEmailEvent,
  type PollEmailStore,
  type PollRecipient,
} from './run'

const ASSOC = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTHER_ASSOC = 'aaaaaaaa-0000-4000-8000-0000000000ff'
const ORG = 'bbbbbbbb-0000-4000-8000-000000000002'
const POLL = 'cccccccc-0000-4000-8000-000000000003'
const NOW = new Date('2026-11-06T15:00:00Z')

function ctx(over: Partial<PollEmailContext['poll']> = {}, assocId = ASSOC): PollEmailContext {
  return {
    association: { id: assocId, name: 'Maple Court', type: 'hoa', organizationId: ORG, timeZone: 'America/New_York' },
    poll: {
      id: POLL,
      associationId: assocId,
      title: 'Paint the fence?',
      description: null,
      allowMultiple: false,
      resultsVisibility: 'after_close',
      status: 'open',
      closesAt: '2026-11-13T05:00:00Z',
      ...over,
    },
    options: ['Yes', 'No'],
  }
}

const r = (n: number): PollRecipient => ({ unitId: `u${n}`, userId: `user${n}`, name: `Name ${n}`, email: `r${n}@example.test` })

function fakeStore(c: PollEmailContext | null, opts: { recipients?: PollRecipient[]; optedOut?: number; existing?: Record<string, string> } = {}) {
  const statuses = new Map<string, string>(Object.entries(opts.existing ?? {}))
  const rows: Array<{ id: string; email: string; status?: string }> = []
  const finished: Array<[string, string]> = []
  const store: PollEmailStore = {
    loadContext: vi.fn(async () => c),
    loadTally: vi.fn(async () => [
      { option_id: 'o1', label: 'Yes', option_position: 0, votes: 3, homes_answered: 4 },
      { option_id: 'o2', label: 'No', option_position: 1, votes: 1, homes_answered: 4 },
    ]),
    loadRecipients: vi.fn(async () => ({ recipients: opts.recipients ?? [r(1), r(2)], optedOut: opts.optedOut ?? 0 })),
    communicationStatus: vi.fn(async (id) => statuses.get(id) ?? null),
    orgSandbox: vi.fn(async () => true),
    claim: vi.fn(async (cl) => {
      if (statuses.has(cl.id)) return { ok: false as const, reason: 'exists' as const }
      statuses.set(cl.id, 'sending')
      return { ok: true as const }
    }),
    insertRecipients: vi.fn(async (_c: string, _o: string, list: PollRecipient[]) =>
      list.map((x) => {
        const id = `row${rows.length + 1}`
        rows.push({ id, email: x.email })
        return { id, email: x.email }
      }),
    ),
    markRecipient: vi.fn(async (id, outcome) => {
      rows.find((x) => x.id === id)!.status = outcome.status
    }),
    finish: vi.fn(async (id, status) => {
      statuses.set(id, status)
      finished.push([id, status])
    }),
  }
  return { store, rows, finished, statuses }
}

function deps(over: Partial<PollEmailDeps> = {}): PollEmailDeps {
  return {
    // A fake: no test here can reach a real transport.
    sendEmailBatch: vi.fn(async (inputs: unknown[]) => inputs.map((_, i) => ({ ok: true as const, messageId: `m${i}` }))),
    emailConfigured: () => true,
    portalUrl: (p) => `https://app.test${p}`,
    now: () => NOW,
    ...over,
  }
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
const opened: PollEmailEvent = { kind: 'opened', trigger: 'board', pollId: POLL, associationId: ASSOC }
const results: PollEmailEvent = { kind: 'results', trigger: 'board', pollId: POLL, associationId: ASSOC }
const ended = { status: 'open' as const, closesAt: '2026-11-05T05:00:00Z' }

describe('runPollEmail: opened', () => {
  it('sends one guarded batch to every home, with the poll link, sandbox flag and communication id', async () => {
    const { store, rows, finished } = fakeStore(ctx())
    const d = deps()
    const res = await runPollEmail(store, d, opened, logger())
    const id = pollEmailCommunicationId(POLL, 'opened')
    expect(res).toMatchObject({ status: 'sent', communicationId: id, sent: 2, failed: 0, held: 0 })
    expect(d.sendEmailBatch).toHaveBeenCalledTimes(1)
    const [inputs, opts] = vi.mocked(d.sendEmailBatch).mock.calls[0]!
    expect(inputs.map((i) => i.to)).toEqual(['r1@example.test', 'r2@example.test'])
    expect(inputs[0]!.recipientRef).toBe('row1')
    expect(inputs[0]!.html).toContain(`https://app.test${pollPortalPath(POLL)}`)
    expect(inputs[0]!.html).toContain('Answer the poll')
    expect(opts).toEqual({ orgSandbox: true, ref: id })
    expect(rows.map((x) => x.status)).toEqual(['sent', 'sent'])
    expect(finished).toEqual([[id, 'sent']])
  })

  it('does not email a draft or a finished poll', async () => {
    for (const over of [{ status: 'draft' as const }, { status: 'closed' as const }, ended]) {
      const { store } = fakeStore(ctx(over))
      const d = deps()
      expect((await runPollEmail(store, d, opened, logger())).status).toBe('not_open')
      expect(d.sendEmailBatch).not.toHaveBeenCalled()
      expect(store.claim).not.toHaveBeenCalled()
    }
  })

  it('is idempotent: a second run for the same poll sends nothing', async () => {
    const { store } = fakeStore(ctx())
    const d = deps()
    await runPollEmail(store, d, opened, logger())
    const again = await runPollEmail(store, d, opened, logger())
    expect(again.status).toBe('already_sent')
    expect(d.sendEmailBatch).toHaveBeenCalledTimes(1)
  })

  it('is idempotent against a racing claim even when the pre-check missed it', async () => {
    const { store } = fakeStore(ctx())
    vi.mocked(store.claim).mockResolvedValueOnce({ ok: false, reason: 'exists' })
    const d = deps()
    expect((await runPollEmail(store, d, opened, logger())).status).toBe('already_sent')
    expect(d.sendEmailBatch).not.toHaveBeenCalled()
  })

  it('the opened and results emails have different ids, and the same id for board and auto', () => {
    expect(pollEmailCommunicationId(POLL, 'opened')).not.toBe(pollEmailCommunicationId(POLL, 'results'))
    expect(pollEmailCommunicationId(POLL, 'results')).toBe(pollEmailCommunicationId(POLL, 'results'))
  })
})

describe('runPollEmail: only this poll’s association', () => {
  it('a poll in another association is not found: nothing read, claimed or sent', async () => {
    const { store } = fakeStore(ctx({}, OTHER_ASSOC))
    const d = deps()
    const res = await runPollEmail(store, d, opened, logger())
    expect(res.status).toBe('not_found')
    expect(store.loadRecipients).not.toHaveBeenCalled()
    expect(d.sendEmailBatch).not.toHaveBeenCalled()
  })

  it('a missing poll is not found', async () => {
    const { store } = fakeStore(null)
    expect((await runPollEmail(store, deps(), opened, logger())).status).toBe('not_found')
  })

  it('recipients are loaded for the poll’s own association only', async () => {
    const { store } = fakeStore(ctx())
    await runPollEmail(store, deps(), opened, logger())
    expect(store.loadRecipients).toHaveBeenCalledWith({ id: ASSOC, organizationId: ORG })
  })
})

describe('runPollEmail: opt-outs and missing contacts', () => {
  it('reports homes that turned off email and sends to the rest', async () => {
    const { store } = fakeStore(ctx(), { recipients: [r(2)], optedOut: 1 })
    const res = await runPollEmail(store, deps(), opened, logger())
    expect(res).toMatchObject({ status: 'sent', sent: 1, optedOut: 1 })
  })

  it('nobody reachable: nothing claimed, so it can still be sent later', async () => {
    const { store } = fakeStore(ctx(), { recipients: [], optedOut: 3 })
    const d = deps()
    const res = await runPollEmail(store, d, opened, logger())
    expect(res).toMatchObject({ status: 'no_recipients', optedOut: 3 })
    expect(store.claim).not.toHaveBeenCalled()
    expect(d.sendEmailBatch).not.toHaveBeenCalled()
  })

  it('email not configured: nothing claimed', async () => {
    const { store } = fakeStore(ctx())
    const d = deps({ emailConfigured: () => false })
    expect((await runPollEmail(store, d, opened, logger())).status).toBe('email_not_configured')
    expect(store.claim).not.toHaveBeenCalled()
  })
})

describe('runPollEmail: the outbound guard', () => {
  it('all recipients held by the guard: recorded suppressed, status held, row cancelled not failed', async () => {
    const { store, rows, finished } = fakeStore(ctx())
    const d = deps({
      sendEmailBatch: vi.fn(async (inputs) => inputs.map(() => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR }))),
    })
    const res = await runPollEmail(store, d, opened, logger())
    expect(res).toMatchObject({ status: 'held', sent: 0, held: 2, failed: 0 })
    expect(rows.map((x) => x.status)).toEqual(['suppressed', 'suppressed'])
    expect(finished[0]![1]).toBe('cancelled')
  })

  it('a transport that throws marks everyone failed and never throws out of the runner', async () => {
    const { store, finished } = fakeStore(ctx())
    const d = deps({ sendEmailBatch: vi.fn(async () => Promise.reject(new TypeError('boom'))) })
    const res = await runPollEmail(store, d, opened, logger())
    expect(res).toMatchObject({ status: 'failed', failed: 2, sent: 0 })
    expect(finished[0]![1]).toBe('failed')
  })

  it('a partial send is still sent, with the failure counted', async () => {
    const { store } = fakeStore(ctx())
    const d = deps({
      sendEmailBatch: vi.fn(async () => [
        { ok: true as const, messageId: 'm' },
        { ok: false as const, error: 'bounced' },
      ]),
    })
    expect(await runPollEmail(store, d, opened, logger())).toMatchObject({ status: 'sent', sent: 1, failed: 1 })
  })

  it('a bookkeeping failure after the batch went out still reports sent, with the real counts', async () => {
    const { store, finished } = fakeStore(ctx())
    vi.mocked(store.markRecipient).mockRejectedValue(new Error('db down'))
    const log = logger()
    const res = await runPollEmail(store, deps(), opened, log)
    expect(res).toMatchObject({ status: 'sent', sent: 2, failed: 0 })
    expect(finished[0]![1]).toBe('sent')
    expect(log.error).toHaveBeenCalled()
  })

  it('logs carry ids and counts only: no address, title, or answer', async () => {
    const { store } = fakeStore(ctx())
    const log = logger()
    await runPollEmail(store, deps(), opened, log)
    const all = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    for (const secret of ['example.test', 'Paint the fence', 'Maple Court', 'Name 1']) expect(all).not.toContain(secret)
  })
})

describe('runPollEmail: results', () => {
  it('a closed poll: emails the tally with bars, after_close visibility included', async () => {
    const { store } = fakeStore(ctx({ status: 'closed', closesAt: null }))
    const d = deps()
    const res = await runPollEmail(store, d, results, logger())
    expect(res.status).toBe('sent')
    const [inputs] = vi.mocked(d.sendEmailBatch).mock.calls[0]!
    expect(inputs[0]!.subject).toBe('Poll results: Paint the fence?')
    expect(inputs[0]!.html).toContain('4 homes answered this poll.')
    expect(inputs[0]!.html).toContain('3 homes (75%)')
    expect(inputs[0]!.html).toContain('See the results')
  })

  it('an open poll gets no results email, even when residents may watch live', async () => {
    for (const vis of ['live', 'after_close'] as const) {
      const { store } = fakeStore(ctx({ resultsVisibility: vis }))
      const d = deps()
      expect((await runPollEmail(store, d, results, logger())).status).toBe('not_closed')
      expect(store.loadTally).not.toHaveBeenCalled()
      expect(d.sendEmailBatch).not.toHaveBeenCalled()
    }
  })

  it('a draft gets none', async () => {
    const { store } = fakeStore(ctx({ status: 'draft' }))
    expect((await runPollEmail(store, deps(), results, logger())).status).toBe('not_closed')
  })

  it('respects canSeeResults: if residents could not see a closed poll’s results, nothing goes out', async () => {
    vi.resetModules()
    vi.doMock('../rules', async (orig) => ({ ...(await orig<typeof import('../rules')>()), canSeeResults: () => false }))
    try {
      const { runPollEmail: run } = await import('./run')
      const { store } = fakeStore(ctx({ status: 'closed', closesAt: null }))
      const d = deps()
      expect((await run(store, d, results, logger())).status).toBe('results_hidden')
      expect(d.sendEmailBatch).not.toHaveBeenCalled()
      expect(store.claim).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('../rules')
      vi.resetModules()
    }
  })

  it('end date passed (status still open): the board path sends results', async () => {
    const { store } = fakeStore(ctx(ended))
    const d = deps()
    expect((await runPollEmail(store, d, results, logger())).status).toBe('sent')
  })

  it('is idempotent: board close then the daily job sends once', async () => {
    const { store } = fakeStore(ctx({ status: 'closed', closesAt: null }), {
      existing: { [pollEmailCommunicationId(POLL, 'opened')]: 'sent' },
    })
    const d = deps()
    await runPollEmail(store, d, results, logger())
    const auto = await runPollEmail(store, d, { ...results, trigger: 'auto' }, logger())
    expect(auto.status).toBe('already_sent')
    expect(d.sendEmailBatch).toHaveBeenCalledTimes(1)
  })

  it('auto (daily job): only when the board emailed the poll when opening it', async () => {
    const auto: PollEmailEvent = { ...results, trigger: 'auto' }
    const none = fakeStore(ctx(ended))
    const d1 = deps()
    expect((await runPollEmail(none.store, d1, auto, logger())).status).toBe('not_opted_in')
    expect(d1.sendEmailBatch).not.toHaveBeenCalled()

    const held = fakeStore(ctx(ended), { existing: { [pollEmailCommunicationId(POLL, 'opened')]: 'cancelled' } })
    expect((await runPollEmail(held.store, deps(), auto, logger())).status).toBe('not_opted_in')

    const yes = fakeStore(ctx(ended), { existing: { [pollEmailCommunicationId(POLL, 'opened')]: 'sent' } })
    const d2 = deps()
    expect((await runPollEmail(yes.store, d2, auto, logger())).status).toBe('sent')
    expect(d2.sendEmailBatch).toHaveBeenCalledTimes(1)
  })

  it('auto: a poll still running is left alone', async () => {
    const { store } = fakeStore(ctx(), { existing: { [pollEmailCommunicationId(POLL, 'opened')]: 'sent' } })
    const d = deps()
    expect((await runPollEmail(store, d, { ...results, trigger: 'auto' }, logger())).status).toBe('not_closed')
    expect(d.sendEmailBatch).not.toHaveBeenCalled()
  })

  it('auto: a poll of another association is not found', async () => {
    const { store } = fakeStore(ctx(ended, OTHER_ASSOC))
    expect((await runPollEmail(store, deps(), { ...results, trigger: 'auto' }, logger())).status).toBe('not_found')
  })
})

describe('lastAnswerDayLabel', () => {
  it('names the last day residents can answer, in the association’s zone', () => {
    // closes_at is the start of the day after the last day (createPollAction).
    expect(lastAnswerDayLabel('2026-11-13T05:00:00Z', 'America/New_York')).toBe('November 12, 2026')
    expect(lastAnswerDayLabel('2026-11-13T08:00:00Z', 'America/Los_Angeles')).toBe('November 12, 2026')
  })
})
