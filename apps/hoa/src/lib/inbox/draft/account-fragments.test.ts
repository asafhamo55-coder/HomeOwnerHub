import { describe, it, expect } from 'vitest'
import { findContactPII } from '@homeowner-portal/ai/pii'
import { buildAccountFragments } from './account-fragments'
import type { HomeAccount } from '@/lib/inbox/account-context'

// Synthetic figures only.
function home(over: Partial<HomeAccount> = {}): HomeAccount {
  return {
    account: {
      homes: 1,
      balanceCents: 41250,
      openChargeCount: 2,
      pastDueCount: 1,
      nextDueDate: '2026-10-01',
      openCharges: [
        { type: 'Regular assessment', dueDate: '2026-10-01', amountCents: 37500, pastDue: true, home: null },
        { type: 'Late fee', dueDate: '2026-11-01', amountCents: 3750, pastDue: false, home: null },
      ],
      lastPayment: { date: '2026-07-02', amountCents: 37500 },
      today: '2026-10-19',
      truncated: false,
    },
    plan: { visible: false },
    requests: {
      tickets: [
        {
          id: 't1',
          subject: 'Gate stuck, call me at (305) 555-0142',
          category: 'maintenance',
          status: 'in_progress',
          createdAt: '2026-10-02T12:00:00Z',
          home: null,
        },
      ],
      arcApplications: [
        {
          id: 'a1',
          summary: 'Paint front door',
          category: 'paint',
          status: 'under_review',
          submittedAt: '2026-09-20T10:00:00Z',
          decidedAt: null,
        },
      ],
      violationsOnMyHome: [
        {
          id: 'v1',
          type: 'trash_cans',
          status: 'notice_sent',
          fineCents: null,
          curePeriodDays: 10,
          noticeSentAt: '2026-10-05T09:00:00Z',
          createdAt: '2026-10-04T09:00:00Z',
        },
      ],
      reportedConcerns: [],
    },
    degraded: [],
    ...over,
  }
}

describe('buildAccountFragments', () => {
  it('emits one citable fragment per fact, with the exact figures', () => {
    const { fragments, degraded } = buildAccountFragments(home())
    expect(degraded).toEqual([])
    const byId = new Map(fragments.map((f) => [f.refId, f]))
    expect(byId.get('acct:balance')!.text).toContain('Balance owed: $412.50 across 2 open charges, 1 of them past due')
    expect(byId.get('acct:charge:1')!.text).toBe('Regular assessment: $375.00 due 2026-10-01, past due.')
    expect(byId.get('acct:last_payment')!.text).toBe('Last payment received: $375.00 on 2026-07-02.')
    expect(byId.get('acct:violation:v1')!.text).toContain('Cure by 2026-10-15')
    expect(byId.get('acct:arc:a1')!.text).toContain('status under review')
    expect(fragments.every((f) => f.sourceType === 'property')).toBe(true)
    expect(new Set(fragments.map((f) => f.refId)).size).toBe(fragments.length)
  })

  it('strips contact details from free text other people wrote (BL-062)', () => {
    const { fragments } = buildAccountFragments(home())
    expect(findContactPII(JSON.stringify(fragments))).toEqual([])
  })

  it('states no balance when the ledger failed or was capped, and says so', () => {
    for (const account of [null, { ...home().account!, truncated: true }]) {
      const { fragments, degraded } = buildAccountFragments(home({ account }))
      expect(fragments.some((f) => f.refId.startsWith('acct:balance') || f.refId.startsWith('acct:charge'))).toBe(false)
      expect(degraded).toContain('account_ledger')
    }
  })

  it('includes a visible payment plan, and marks failed request reads', () => {
    const { fragments, degraded } = buildAccountFragments(
      home({
        plan: {
          visible: true,
          plan: { status: 'active', installmentCents: 10000, installments: 4, totalCents: 40000, startDate: '2026-08-01' },
        },
        requests: null,
      }),
    )
    expect(fragments.find((f) => f.refId === 'acct:plan')!.text).toBe(
      'Payment plan (active): 4 installments of $100.00, $400.00 in total, starting 2026-08-01.',
    )
    expect(degraded).toContain('account_requests')
  })
})
