import { describe, expect, it, vi } from 'vitest'

import { createFailureReportingMiddleware } from './failure-reporting'

// Drives the middleware's hooks directly with the shapes Inngest passes
// (InngestMiddleware.d.ts: onFunctionRun → transformInput → transformOutput)
// rather than standing up an Inngest dev server.
async function runHooks(opts: {
  attempt: number
  maxAttempts?: number
  error?: unknown
  step?: { name?: string; displayName?: string }
}) {
  const capture = vi.fn()
  const mw = createFailureReportingMiddleware(capture)
  const registered = await mw.init()
  const fn = { id: () => 'homeownerhub-plaid-sync' }
  const hooks = await registered.onFunctionRun!({
    fn,
    ctx: { runId: 'run-1', event: { name: 'app/test', data: { resident_email: 'jane@example.com' } } },
    steps: [],
    reqArgs: [],
  } as never)
  await hooks.transformInput?.({
    ctx: { attempt: opts.attempt, maxAttempts: opts.maxAttempts },
    steps: [],
    fn,
    reqArgs: [],
  } as never)
  await hooks.transformOutput?.({
    result: { error: opts.error, data: undefined },
    step: opts.step,
  } as never)
  return capture
}

describe('Inngest failure reporting middleware', () => {
  it('captures nothing for a successful run', async () => {
    const capture = await runHooks({ attempt: 0 })
    expect(capture).not.toHaveBeenCalled()
  })

  it('reports a retried attempt as a warning with function and run ids', async () => {
    const err = new Error('plaid 500')
    const capture = await runHooks({ attempt: 0, maxAttempts: 4, error: err })
    expect(capture).toHaveBeenCalledTimes(1)
    const [captured, context] = capture.mock.calls[0]!
    expect(captured).toBe(err)
    expect(context.level).toBe('warning')
    expect(context.tags).toMatchObject({
      source: 'inngest',
      'inngest.function': 'homeownerhub-plaid-sync',
      'inngest.run_id': 'run-1',
      'inngest.attempt': '0',
      'inngest.final_attempt': 'false',
    })
  })

  it('reports the last attempt as an error', async () => {
    const capture = await runHooks({ attempt: 3, maxAttempts: 4, error: new Error('x') })
    expect(capture.mock.calls[0]![1].level).toBe('error')
    expect(capture.mock.calls[0]![1].tags['inngest.final_attempt']).toBe('true')
  })

  it('falls back to Inngest’s default of 4 attempts when maxAttempts is absent', async () => {
    const capture = await runHooks({ attempt: 3, error: new Error('x') })
    expect(capture.mock.calls[0]![1].level).toBe('error')
  })

  it('tags the failing step', async () => {
    const capture = await runHooks({
      attempt: 0,
      error: new Error('x'),
      step: { name: 'fetch-transactions', displayName: 'Fetch transactions' },
    })
    expect(capture.mock.calls[0]![1].tags['inngest.step']).toBe('Fetch transactions')
  })

  it('never attaches the event payload', async () => {
    const capture = await runHooks({ attempt: 0, error: new Error('x') })
    expect(JSON.stringify(capture.mock.calls[0]![1])).not.toContain('jane@example.com')
  })
})
