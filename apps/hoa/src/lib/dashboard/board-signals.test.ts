import { describe, expect, it } from 'vitest'
import {
  ARC_BACKLOG_THRESHOLD,
  buildBoardSignals,
  DUES_TREND_MIN_PCT,
  DUES_TREND_MIN_USD,
  LEASE_HEADROOM_THRESHOLD,
  OPEN_TICKET_THRESHOLD,
  STALE_APPROVAL_DAYS,
  UNTRIAGED_THRESHOLD,
  VIOLATION_TREND_MIN_COUNT,
  VIOLATION_TREND_MIN_PCT,
  type BoardSignalsInput,
} from './board-signals'

/**
 * A community with nothing wrong: every signal's condition is false and
 * every upstream query succeeded.
 */
function quiet(): BoardSignalsInput {
  return {
    atRisk: {
      counts: {
        duesOverdueUnits: 0,
        cureDeadlinesElapsed: 0,
        cureDeadlinesUpcoming: 0,
        coiExpiring: 0,
      },
      failed: false,
    },
    staleApprovals: { count: 0, failed: false },
    lease: {
      hasAssociation: true,
      capPct: 15,
      totalUnits: 100,
      leasedCount: 5,
      leasedPct: 5,
      headroom: 10,
      waitingListCount: 0,
      capIsMixed: false,
      failed: false,
    },
    residentQueues: { openTickets: 0, pendingArcRequests: 0, openConcerns: 0, failed: false },
    kpis: {
      duesOutstandingUsd: { value: 1000, previous: 1000 },
      openViolations: { value: 4, previous: 4 },
      activeVendors: { value: 6, previous: 6 },
      openTickets: { value: 0, previous: 0 },
      failed: false,
    },
    triage: {
      needsReply: { count: 0, oldestWaitingDays: null },
      untriaged: { count: 0 },
      threads: [],
      failed: false,
    },
  }
}

/** Every signal's condition true at once, all queries healthy. */
function everythingFiring(): BoardSignalsInput {
  const input = quiet()
  input.atRisk.counts = {
    duesOverdueUnits: 22,
    cureDeadlinesElapsed: 4,
    cureDeadlinesUpcoming: 1,
    coiExpiring: 2,
  }
  input.staleApprovals.count = 6
  input.lease.headroom = 0
  input.lease.waitingListCount = 3
  input.residentQueues = {
    openTickets: OPEN_TICKET_THRESHOLD * 4,
    pendingArcRequests: ARC_BACKLOG_THRESHOLD * 3,
    openConcerns: 2,
    failed: false,
  }
  input.triage.untriaged.count = UNTRIAGED_THRESHOLD * 6
  input.kpis.duesOutstandingUsd = { value: 20_000, previous: 10_000 }
  input.kpis.openViolations = { value: 30, previous: 10 }
  return input
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

  it('writes a singular subject for a single delinquent unit', () => {
    const input = quiet()
    input.atRisk.counts.duesOverdueUnits = 1
    const headline = find(input, 'dues_overdue')?.headline ?? ''
    expect(headline).toContain('1 unit is')
    expect(headline).not.toContain('units are')
  })

  it('reports the true count of units behind on dues, not a display slice', () => {
    // getAtRiskThisWeek returns `items` capped at 6 rows across all three
    // kinds. Counting that array reported "6 units behind" for a community
    // with 22, on the card whose whole premise is that its numbers are the
    // ones you can quote in a meeting.
    const input = quiet()
    input.atRisk.counts.duesOverdueUnits = 22
    const signal = find(input, 'dues_overdue')
    expect(signal?.severity).toBe('red')
    expect(signal?.headline).toContain('22')
  })

  it('flags dues outstanding rising past the trend threshold', () => {
    const input = quiet()
    const previous = 10_000
    const value = Math.ceil(previous * (1 + DUES_TREND_MIN_PCT / 100))
    input.kpis.duesOutstandingUsd = { value, previous }
    expect(kinds(input)).toContain('dues_trend')
    expect(find(input, 'dues_trend')?.headline).toContain(`${DUES_TREND_MIN_PCT}%`)
  })

  it('ignores a large percentage rise on a trivially small balance', () => {
    // The dollar floor exists to stop "+299%" on a $40 balance — the false
    // alarm that teaches a board to stop reading the card.
    const input = quiet()
    input.kpis.duesOutstandingUsd = { value: DUES_TREND_MIN_USD - 1, previous: 100 }
    expect(kinds(input)).not.toContain('dues_trend')
  })

  it('reports the rise once the balance clears the dollar floor', () => {
    const input = quiet()
    input.kpis.duesOutstandingUsd = { value: DUES_TREND_MIN_USD, previous: 400 }
    expect(kinds(input)).toContain('dues_trend')
  })

  it('formats the outstanding balance as whole dollars with separators', () => {
    const input = quiet()
    input.kpis.duesOutstandingUsd = { value: 12_345.67, previous: 10_000 }
    expect(find(input, 'dues_trend')?.headline).toContain('$12,346')
  })

  it('reports no trend against a zero or negative baseline', () => {
    // pctChange must not produce "up Infinity%" — a figure no board can act
    // on and an obvious tell that the card is computing garbage.
    for (const previous of [0, -100]) {
      const input = quiet()
      input.kpis.duesOutstandingUsd = { value: 12_000, previous }
      expect(kinds(input)).not.toContain('dues_trend')
    }
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
    input.atRisk.counts.cureDeadlinesElapsed = 4
    const signal = find(input, 'cure_deadline')
    expect(signal?.severity).toBe('red')
    expect(signal?.headline).toContain('4')
  })

  it('flags an approaching cure deadline as amber, not red', () => {
    const input = quiet()
    input.atRisk.counts.cureDeadlinesUpcoming = 2
    expect(find(input, 'cure_deadline')?.severity).toBe('amber')
  })

  it('leads with the elapsed deadlines when both elapsed and upcoming exist', () => {
    const input = quiet()
    input.atRisk.counts.cureDeadlinesElapsed = 3
    input.atRisk.counts.cureDeadlinesUpcoming = 7
    const signal = find(input, 'cure_deadline')
    expect(signal?.severity).toBe('red')
    expect(signal?.headline).toContain('3')
  })

  it('flags expiring vendor COIs', () => {
    const input = quiet()
    input.atRisk.counts.coiExpiring = 2
    expect(kinds(input)).toContain('coi_expiring')
  })

  it('stays silent on every at-risk signal when the at-risk queries failed', () => {
    // Zero from a failed query means UNKNOWN. Rendering it as "nothing is
    // overdue" is the exact false reassurance this card must never give.
    const input = quiet()
    input.atRisk = {
      counts: {
        duesOverdueUnits: 22,
        cureDeadlinesElapsed: 4,
        cureDeadlinesUpcoming: 1,
        coiExpiring: 2,
      },
      failed: true,
    }
    expect(kinds(input)).toEqual([])
  })

  it('flags open violations rising past the trend threshold', () => {
    const input = quiet()
    const previous = 20
    input.kpis.openViolations = {
      value: Math.ceil(previous * (1 + VIOLATION_TREND_MIN_PCT / 100)),
      previous,
    }
    expect(kinds(input)).toContain('violations_trend')
  })

  it('ignores a large percentage rise on a handful of violations', () => {
    const input = quiet()
    input.kpis.openViolations = { value: VIOLATION_TREND_MIN_COUNT - 1, previous: 1 }
    expect(kinds(input)).not.toContain('violations_trend')
  })

  it('reports the rise once the violation count clears the floor', () => {
    const input = quiet()
    input.kpis.openViolations = {
      value: VIOLATION_TREND_MIN_COUNT,
      previous: Math.floor(VIOLATION_TREND_MIN_COUNT / (1 + VIOLATION_TREND_MIN_PCT / 100)),
    }
    expect(kinds(input)).toContain('violations_trend')
  })

  it('ignores a violation rise below the trend threshold', () => {
    const input = quiet()
    const justUnder = Math.floor(10 * (1 + (VIOLATION_TREND_MIN_PCT - 1) / 100))
    input.kpis.openViolations = { value: justUnder, previous: 10 }
    expect(kinds(input)).not.toContain('violations_trend')
  })

  it('stays silent on both trends when the KPI queries failed', () => {
    const input = quiet()
    input.kpis = {
      duesOutstandingUsd: { value: 20_000, previous: 10_000 },
      openViolations: { value: 30, previous: 10 },
      activeVendors: { value: 6, previous: 6 },
      openTickets: { value: 0, previous: 0 },
      failed: true,
    }
    expect(kinds(input)).toEqual([])
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

  it('says nothing about a lease cap one slot above the threshold', () => {
    const input = quiet()
    input.lease.headroom = LEASE_HEADROOM_THRESHOLD + 1
    expect(kinds(input)).not.toContain('lease_cap')
  })

  it('says nothing about a lease cap with room to spare', () => {
    expect(kinds(quiet())).not.toContain('lease_cap')
  })

  it('labels a mixed cap so the board is not told the wrong governing number', () => {
    // Under mixed caps capPct is the LOWEST of several. Stating "the 15%
    // cap" unqualified misdescribes the governing document to a board
    // deciding whether to approve a lease.
    const input = quiet()
    input.lease.headroom = 0
    input.lease.capIsMixed = true
    expect(find(input, 'lease_cap')?.headline).toContain('most restrictive')
  })

  it('says nothing about leasing for an org with no association', () => {
    const input = quiet()
    input.lease = {
      hasAssociation: false,
      capPct: null,
      totalUnits: 0,
      leasedCount: 0,
      leasedPct: 0,
      headroom: null,
      waitingListCount: 0,
      capIsMixed: false,
      failed: false,
    }
    expect(kinds(input)).toEqual([])
  })

  it('says nothing about a lease cap that is not set', () => {
    const input = quiet()
    input.lease.capPct = null
    input.lease.headroom = null
    expect(kinds(input)).not.toContain('lease_cap')
  })

  it('stays silent on leasing when the lease queries failed', () => {
    // A failed leased-count query returns 0, which computes as MAXIMUM
    // headroom — so this signal would go quiet on precisely the day the
    // community breaches its cap.
    const input = quiet()
    input.lease.headroom = 0
    input.lease.waitingListCount = 3
    input.lease.failed = true
    expect(kinds(input)).toEqual([])
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

  it('ignores an open-ticket count below the threshold', () => {
    const input = quiet()
    input.residentQueues.openTickets = OPEN_TICKET_THRESHOLD - 1
    expect(kinds(input)).not.toContain('ticket_backlog')
  })

  it('flags any resident-reported concern awaiting review', () => {
    const input = quiet()
    input.residentQueues.openConcerns = 1
    expect(kinds(input)).toContain('resident_concerns')
  })

  it('stays silent on every resident queue when those counts failed', () => {
    const input = quiet()
    input.residentQueues = {
      openTickets: 40,
      pendingArcRequests: 9,
      openConcerns: 2,
      failed: true,
    }
    expect(kinds(input)).toEqual([])
  })

  // ─── Board process ─────────────────────────────────────────────────

  it('reports the true stale-approval count', () => {
    // Counting getApprovalsInbox().items capped this at 40 and, worse,
    // sampled the NEWEST 10 per source — so the older the backlog got, the
    // closer the signal reported to zero.
    const input = quiet()
    input.staleApprovals.count = 25
    const signal = find(input, 'stale_approvals')
    expect(signal?.severity).toBe('red')
    expect(signal?.headline).toContain('25')
    expect(signal?.headline).toContain(String(STALE_APPROVAL_DAYS))
  })

  it('says nothing when no approval is stale', () => {
    expect(kinds(quiet())).not.toContain('stale_approvals')
  })

  it('stays silent on approvals when the stale count failed', () => {
    const input = quiet()
    input.staleApprovals = { count: 25, failed: true }
    expect(kinds(input)).not.toContain('stale_approvals')
  })

  it('flags unmatched mail at the threshold', () => {
    const input = quiet()
    input.triage.untriaged.count = UNTRIAGED_THRESHOLD
    expect(kinds(input)).toContain('untriaged_mail')
  })

  it('ignores unmatched mail below the threshold', () => {
    const input = quiet()
    input.triage.untriaged.count = UNTRIAGED_THRESHOLD - 1
    expect(kinds(input)).not.toContain('untriaged_mail')
  })

  it('stays silent about mail when the triage queries failed', () => {
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
    input.atRisk.counts.duesOverdueUnits = 4 // red
    expect(buildBoardSignals(input).map((s) => s.severity)).toEqual(['red', 'amber', 'info'])
  })

  it('emits every kind exactly once when everything is firing', () => {
    // A `length > 4` assertion cannot see a whole kind going missing —
    // eleven is still more than four. Pin the full set.
    expect(buildBoardSignals(everythingFiring()).map((s) => s.kind).sort()).toEqual(
      [
        'arc_backlog',
        'coi_expiring',
        'cure_deadline',
        'dues_overdue',
        'dues_trend',
        'lease_cap',
        'resident_concerns',
        'stale_approvals',
        'ticket_backlog',
        'untriaged_mail',
        'violations_trend',
        'waiting_list',
      ].sort(),
    )
  })

  it.each([
    ['dues_overdue', '/dues', 'red'],
    ['dues_trend', '/dues', 'amber'],
    ['cure_deadline', '/violations', 'red'],
    ['coi_expiring', '/vendors', 'amber'],
    ['violations_trend', '/violations', 'amber'],
    ['lease_cap', '/leases', 'red'],
    ['waiting_list', '/leases', 'info'],
    ['arc_backlog', '/arc', 'amber'],
    ['ticket_backlog', '/tickets', 'amber'],
    ['resident_concerns', '/violations', 'amber'],
    ['stale_approvals', '/', 'red'],
    ['untriaged_mail', '/inbox', 'amber'],
  ])('%s links to %s at severity %s', (kind, href, severity) => {
    // A board member clicking "3 certificates of insurance expire" and
    // landing on the dues ledger is a real bug that a startsWith('/')
    // check cannot see.
    const signal = buildBoardSignals(everythingFiring()).find((s) => s.kind === kind)
    expect(signal?.href).toBe(href)
    expect(signal?.severity).toBe(severity)
    expect(signal?.headline.trim()).not.toBe('')
  })
})
