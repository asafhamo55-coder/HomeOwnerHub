import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import type { DriftCitation } from '../compliance/statute-drift'
import {
  ALL_CURE_CITATIONS,
  CA_5855_COMMITMENT,
  CA_5855_CURED,
  CA_5855_NO_DISCIPLINE,
  CURE_CANCEL_REASONS,
  CURE_CANCEL_REASON_LABEL,
  CURE_CHECK_GOVERNING_DOCUMENTS,
  cureBeforeHearingOffer,
  cureCancelAuditMetadata,
  isCureCancelReason,
} from './cure'
import { CA_5855_CURE, FL_305_CURED, hearingFineFacts, type HearingRecord } from './rules'

// BL-140 (remainder): cure before the hearing.

// ─── every quote is verbatim, in the subdivision it names ────────────

const REPO_ROOT = resolve(__dirname, '../../../../..')
const fixture = (name: string) => readFileSync(resolve(REPO_ROOT, 'scripts/fixtures/state-law', name), 'utf8')
const squash = (s: string) => s.replace(/\s+/g, ' ')
const caText = fixture('ca-civ-davis-stirling-2026.txt')
const ca5855 = (() => {
  const start = caText.indexOf('=== Civ. Code § 5855.  [')
  const end = caText.indexOf('\n=== ', start + 10)
  return squash(caText.slice(start, end === -1 ? undefined : end))
})()
const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const fl305 = squash(fl.find((r) => r.code_citation === 'Fla. Stat. § 720.305')!.body)

function sectionFor(c: DriftCitation): string {
  if (c.cite.startsWith('Fla. Stat. § 720.305')) return fl305
  if (c.cite.startsWith('Cal. Civ. Code § 5855')) return ca5855
  throw new Error(`no section mapped for ${c.cite}`)
}

describe('cure citations are verbatim from the fixtures', () => {
  it('the CA section was found', () => {
    expect(ca5855.length).toBeGreaterThan(500)
  })
  it.each(ALL_CURE_CITATIONS.map((c) => [`${c.cite} ${c.quote.slice(0, 30)}`, c] as const))('%s', (_n, c) => {
    expect(sectionFor(c)).toContain(squash(c.quote))
  })
  it('pinpoints: each quote sits in the subdivision it names', () => {
    expect(fl305).toContain(`(e) ${FL_305_CURED.quote}`)
    expect(ca5855).toContain(`(c)${CA_5855_CURE.quote} ${CA_5855_NO_DISCIPLINE.quote}`)
    expect(ca5855).toContain(`(1)${CA_5855_CURED.quote}`)
    expect(ca5855).toContain(`(2)${CA_5855_COMMITMENT.quote}`)
  })
})

// ─── the offer ───────────────────────────────────────────────────────

const scheduled = { status: 'scheduled' as const, hearingOn: '2026-11-20' }

describe('cureBeforeHearingOffer', () => {
  it('FL: quotes § 720.305(2)(e) and offers the FL reasons', () => {
    const o = cureBeforeHearingOffer({ state: 'FL', violationStatus: 'resolved', resolvedOn: '2026-11-10', hearing: scheduled })
    expect(o).not.toBeNull()
    expect(o!.state).toBe('FL')
    expect(o!.citations).toEqual([FL_305_CURED])
    expect(o!.note).toBeNull()
    expect(o!.reasons).toEqual(['cured_before_hearing', 'cured_as_noticed', 'board_withdrew'])
  })

  it('CA: quotes § 5855(c), (c)(1) and (c)(2); offers a financial commitment', () => {
    const o = cureBeforeHearingOffer({ state: 'California', violationStatus: 'resolved', resolvedOn: null, hearing: { status: 'requested', hearingOn: null } })
    expect(o!.state).toBe('CA')
    expect(o!.citations).toEqual([CA_5855_CURE, CA_5855_NO_DISCIPLINE, CA_5855_CURED, CA_5855_COMMITMENT])
    expect(o!.reasons).toContain('cure_commitment')
    expect(o!.reasons).not.toContain('cured_as_noticed')
  })

  it.each(['TX', 'GA', null])('%s: no quote, "check your governing documents"', (state) => {
    const o = cureBeforeHearingOffer({ state, violationStatus: 'resolved', resolvedOn: '2026-11-10', hearing: scheduled })
    expect(o!.citations).toEqual([])
    expect(o!.note).toBe(CURE_CHECK_GOVERNING_DOCUMENTS)
    expect(o!.note).toMatch(/check your governing documents/i)
    expect(o!.reasons).toEqual(['cured_before_hearing', 'board_withdrew'])
  })

  it('a cure on the hearing day still counts as before it', () => {
    expect(cureBeforeHearingOffer({ state: 'FL', violationStatus: 'resolved', resolvedOn: '2026-11-20', hearing: scheduled })).not.toBeNull()
  })

  it('a cure after the scheduled hearing day is not "before the hearing"', () => {
    expect(cureBeforeHearingOffer({ state: 'FL', violationStatus: 'resolved', resolvedOn: '2026-11-21', hearing: scheduled })).toBeNull()
  })

  it.each(['open', 'notice_sent', 'fined', 'dismissed', null])('violation %s: nothing to offer', (status) => {
    expect(cureBeforeHearingOffer({ state: 'FL', violationStatus: status, resolvedOn: null, hearing: scheduled })).toBeNull()
  })

  it('the legacy "cured" status counts as resolved', () => {
    expect(cureBeforeHearingOffer({ state: 'CA', violationStatus: 'cured', resolvedOn: null, hearing: scheduled })).not.toBeNull()
  })

  it.each(['held', 'cancelled'] as const)('a %s hearing: nothing to offer', (status) => {
    expect(cureBeforeHearingOffer({ state: 'FL', violationStatus: 'resolved', resolvedOn: null, hearing: { status, hearingOn: '2026-11-20' } })).toBeNull()
  })

  it('no hearing: nothing to offer', () => {
    expect(cureBeforeHearingOffer({ state: 'FL', violationStatus: 'resolved', resolvedOn: null, hearing: null })).toBeNull()
  })

  it('every offered reason has a label', () => {
    for (const r of CURE_CANCEL_REASONS) expect(CURE_CANCEL_REASON_LABEL[r]).toBeTruthy()
    expect(isCureCancelReason('board_withdrew')).toBe(true)
    expect(isCureCancelReason('because')).toBe(false)
  })
})

describe('after the cancellation', () => {
  it('a cancelled hearing no longer counts for the fine gate', () => {
    const h: HearingRecord = {
      id: 'h1',
      violationId: 'v1',
      status: 'cancelled',
      requestedAt: null,
      residentStatement: null,
      hearingOn: '2026-11-20',
      hearingTime: null,
      location: null,
      panel: [],
      noticeSentOn: '2026-11-01',
      outcome: null,
      decidedOn: null,
      findingsSentOn: null,
      paymentDueOn: null,
    }
    expect(hearingFineFacts(h)).toBeNull()
  })

  it('the audit metadata is ids and codes only', () => {
    const m = cureCancelAuditMetadata({ hearingId: 'h1', reason: 'cured_before_hearing', state: 'FL', priorStatus: 'scheduled' })
    expect(m).toEqual({ hearing_id: 'h1', reason: 'cured_before_hearing', state: 'FL', prior_status: 'scheduled' })
  })
})
