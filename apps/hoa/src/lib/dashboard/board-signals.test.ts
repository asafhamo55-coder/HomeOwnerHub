import { describe, expect, it } from 'vitest'
import {
  ARC_BACKLOG_THRESHOLD,
  buildBoardSignals,
  DUES_TREND_MIN_PCT,
  OPEN_TICKET_THRESHOLD,
  STALE_APPROVAL_DAYS,
  UNTRIAGED_THRESHOLD,
  VIOLATION_TREND_MIN_PCT,
  type BoardSignalsInput,
} from './board-signals'

const NOW = new Date('2026-08-24T12:00:00Z')

/** A community with nothing wrong: every signal's condition is false. */
function quiet(): BoardSignalsInput {
  return {
    atRisk: { items: [], totalCount: 0 },
    approvals: { items: [], totalCount: 0 },
    lease: {
      hasAssociation: true,
      capPct: 15,
      totalUnits: 100,
      leasedCount: 5,
      leasedPct: 5,
      headroom: 10,
      waitingListCount: 0,
      capIsMixed: false,
    },
    residentQueues: { openTickets: 0, pendingArcRequests: 0, openConcerns: 0 },
    kpis: {
      duesOutstandingUsd: { value: 1000, previous: 1000 },
      openViolations: { value: 4, previous: 4 },
      activeVendors: { value: 6, previous: 6 },
      openTickets: { value: 0, previous: 0 },
    },
    triage: {
      needsReply: { count: 0, oldestWaitingDays: null },
      untriaged: { count: 0 },
      threads: [],
      failed: false,
    },
    now: NOW,
  }
}

function kinds(input: BoardSignalsInput): string[] {
  return buildBoardSignals(input).map((s) => s.kind)
}

function find(input: BoardSignalsInput, kind: string) {
  return buildBoardSignals(input).find((s) => s.kind === kind)
}

describe('buildBoardSignals', () => {
  it('returns nothing for a community with no problems', () => {
    expect(buildBoardSignals(quiet())).toEqual([])
  })

  // ─── Money ─────────────────────────────────────────────────────────

  it('flags units more than 30 days behind on dues as red', () => {
    const input = quiet()
    input.atRisk = {
      items: [
        { kind: 'dues_overdue', id: 'a', title: 'x', severity: 'red', daysOffset: -45, href: '/x' },
        { kind: 'dues_overdue', id: 'b', title: 'y', severity: 'red', daysOffset: -60, href: '/y' },
      ],
      totalCount: 2,
    }
    const signal = find(input, 'dues_overdue')
    expect(signal?.severity).toBe('red')
    expect(signal?.headline).toContain('2')
  })

  it('flags dues outstanding rising past the trend threshold', () => {
    const input = quiet()
    input.kpis.duesOutstandingUsd = { value: 12_000, previous: 10_000 }
    expect(kinds(input)).toContain('dues_trend')
    expect(find(input, 'dues_trend')?.headline).toContain('20%')
  })

  it('ignores a dues rise below the trend threshold', () => {
    const input = quiet()
    const justUnder = Math.floor(10_000 * (1 + (DUES_TREND_MIN_PCT - 1) / 100))
    input.kpis.duesOutstandingUsd = { value: justUnder, previous: 10_000 }
    expect(kinds(input)).not.toContain('dues_trend')
  })

  it('ignores a dues trend with no comparable baseline', () => {
    const input = quiet()
    input.kpis.duesOutstandingUsd = { value: 12_000, previous: null }
    expect(kinds(input)).not.toContain('dues_trend')
  })

  it('does not report a dues trend when outstanding dues fell', () => {
    const input = quiet()
    input.kpis.duesOutstandingUsd = { value: 5_000, previous: 10_000 }
    expect(kinds(input)).not.toContain('dues_trend')
  })

  // ─── Compliance ────────────────────────────────────────────────────

  it('flags an elapsed cure deadline as red', () => {
    const input = quiet()
    input.atRisk = {
      items: [
        { kind: 'cure_deadline', id: 'a', title: 'x', severity: 'red', daysOffset: -2, href: '/x' },
      ],
      totalCount: 1,
    }
    expect(find(input, 'cure_deadline')?.severity).toBe('red')
  })

  it('flags an approaching cure deadline as amber, not red', () => {
    const input = quiet()
    input.atRisk = {
      items: [
        { kind: 'cure_deadline', id: 'a', title: 'x', severity: 'amber', daysOffset: 4, href: '/x' },
      ],
      totalCount: 1,
    }
    expect(find(input, 'cure_deadline')?.severity).toBe('amber')
  })

  it('flags expiring vendor COIs', () => {
    const input = quiet()
    input.atRisk = {
      items: [
        { kind: 'coi_expiring', id: 'a', title: 'x', severity: 'amber', daysOffset: 9, href: '/x' },
      ],
      totalCount: 1,
    }
    expect(kinds(input)).toContain('coi_expiring')
  })

  it('flags open violations rising past the trend threshold', () => {
    const input = quiet()
    input.kpis.openViolations = { value: 20, previous: 10 }
    expect(kinds(input)).toContain('violations_trend')
  })

  it('ignores a violation rise below the trend threshold', () => {
    const input = quiet()
    const justUnder = Math.floor(10 * (1 + (VIOLATION_TREND_MIN_PCT - 1) / 100))
    input.kpis.openViolations = { value: justUnder, previous: 10 }
    expect(kinds(input)).not.toContain('violations_trend')
  })

  // ─── Leasing ───────────────────────────────────────────────────────

  it('flags an exhausted lease cap as red', () => {
    const input = quiet()
    input.lease.headroom = 0
    expect(find(input, 'lease_cap')?.severity).toBe('red')
  })

  it('flags a nearly exhausted lease cap as amber', () => {
    const input = quiet()
    input.lease.headroom = 1
    expect(find(input, 'lease_cap')?.severity).toBe('amber')
  })

  it('says nothing about a lease cap with room to spare', () => {
    expect(kinds(quiet())).not.toContain('lease_cap')
  })

  it('says nothing about a lease cap that is not set', () => {
    const input = quiet()
    input.lease.capPct = null
    input.lease.headroom = null
    expect(kinds(input)).not.toContain('lease_cap')
  })

  it('flags properties queued on the lease waiting list', () => {
    const input = quiet()
    input.lease.waitingListCount = 3
    expect(kinds(input)).toContain('waiting_list')
  })

  // ─── Resident queues ───────────────────────────────────────────────

  it('flags an ARC backlog at the threshold', () => {
    const input = quiet()
    input.residentQueues.pendingArcRequests = ARC_BACKLOG_THRESHOLD
    expect(kinds(input)).toContain('arc_backlog')
  })

  it('ignores an ARC queue below the threshold', () => {
    const input = quiet()
    input.residentQueues.pendingArcRequests = ARC_BACKLOG_THRESHOLD - 1
    expect(kinds(input)).not.toContain('arc_backlog')
  })

  it('flags an open-ticket backlog at the threshold', () => {
    const input = quiet()
    input.residentQueues.openTickets = OPEN_TICKET_THRESHOLD
    expect(kinds(input)).toContain('ticket_backlog')
  })

  it('flags any resident-reported concern awaiting review', () => {
    const input = quiet()
    input.residentQueues.openConcerns = 1
    expect(kinds(input)).toContain('resident_concerns')
  })

  // ─── Board process ─────────────────────────────────────────────────

  it('flags approvals pending longer than the stale window', () => {
    const input = quiet()
    const old = new Date(NOW.getTime() - (STALE_APPROVAL_DAYS + 1) * 86_400_000).toISOString()
    input.approvals = {
      items: [{ kind: 'invoice', id: 'a', title: 'x', pendingSince: old, href: '/x' }],
      totalCount: 1,
    }
    expect(kinds(input)).toContain('stale_approvals')
  })

  it('does not flag a freshly pending approval', () => {
    const input = quiet()
    const recent = new Date(NOW.getTime() - 86_400_000).toISOString()
    input.approvals = {
      items: [{ kind: 'invoice', id: 'a', title: 'x', pendingSince: recent, href: '/x' }],
      totalCount: 1,
    }
    expect(kinds(input)).not.toContain('stale_approvals')
  })

  it('does not flag an approval with no pending timestamp', () => {
    const input = quiet()
    input.approvals = {
      items: [{ kind: 'invoice', id: 'a', title: 'x', pendingSince: null, href: '/x' }],
      totalCount: 1,
    }
    expect(kinds(input)).not.toContain('stale_approvals')
  })

  it('flags unmatched mail at the threshold', () => {
    const input = quiet()
    input.triage.untriaged.count = UNTRIAGED_THRESHOLD
    expect(kinds(input)).toContain('untriaged_mail')
  })

  it('stays silent about mail when the triage queries failed', () => {
    // A failed query means the count is UNKNOWN, not zero — and equally
    // not "50 untriaged". Reporting either to the board is a fabrication.
    const input = quiet()
    input.triage.untriaged.count = UNTRIAGED_THRESHOLD * 10
    input.triage.failed = true
    expect(kinds(input)).not.toContain('untriaged_mail')
  })

  // ─── Shape ─────────────────────────────────────────────────────────

  it('orders red before amber before info', () => {
    const input = quiet()
    input.lease.waitingListCount = 3 // info
    input.residentQueues.openConcerns = 2 // amber
    input.atRisk = {
      items: [
        { kind: 'dues_overdue', id: 'a', title: 'x', severity: 'red', daysOffset: -45, href: '/x' },
      ],
      totalCount: 1,
    }
    const severities = buildBoardSignals(input).map((s) => s.severity)
    expect(severities).toEqual(['red', 'amber', 'info'])
  })

  it('gives every signal a headline and a link', () => {
    const input = quiet()
    input.lease.headroom = 0
    input.lease.waitingListCount = 3
    input.residentQueues = { openTickets: 40, pendingArcRequests: 9, openConcerns: 2 }
    input.triage.untriaged.count = 30
    input.kpis.duesOutstandingUsd = { value: 20_000, previous: 10_000 }
    input.kpis.openViolations = { value: 30, previous: 10 }
    input.atRisk = {
      items: [
        { kind: 'dues_overdue', id: 'a', title: 'x', severity: 'red', daysOffset: -45, href: '/x' },
        { kind: 'cure_deadline', id: 'b', title: 'y', severity: 'red', daysOffset: -2, href: '/y' },
        { kind: 'coi_expiring', id: 'c', title: 'z', severity: 'amber', daysOffset: 9, href: '/z' },
      ],
      totalCount: 3,
    }
    const signals = buildBoardSignals(input)
    expect(signals.length).toBeGreaterThan(4)
    for (const s of signals) {
      expect(s.headline.trim()).not.toBe('')
      expect(s.href.startsWith('/')).toBe(true)
    }
  })
})
