import { describe, expect, it } from 'vitest'
import { wantsMonthlyBoardReport, withMonthlyBoardReportPref } from './prefs'

describe('wantsMonthlyBoardReport — default ON, off only when explicitly turned off', () => {
  it('is on with no preferences stored', () => {
    for (const meta of [undefined, null, {}, { notification_prefs: null }, { notification_prefs: {} }, 'junk', 42]) {
      expect(wantsMonthlyBoardReport(meta)).toBe(true)
    }
  })

  it('is off only for an explicit false', () => {
    expect(wantsMonthlyBoardReport({ notification_prefs: { monthly_board_report: false } })).toBe(false)
    expect(wantsMonthlyBoardReport({ notification_prefs: { monthly_board_report: true } })).toBe(true)
    // Anything that is not the boolean false is not an opt-out.
    expect(wantsMonthlyBoardReport({ notification_prefs: { monthly_board_report: 'false' } })).toBe(true)
    expect(wantsMonthlyBoardReport({ notification_prefs: { monthly_board_report: 0 } })).toBe(true)
  })
})

describe('withMonthlyBoardReportPref', () => {
  it('returns the user_metadata patch, keeping other notification prefs', () => {
    expect(withMonthlyBoardReportPref({ notification_prefs: { other: 1 }, full_name: 'x' }, false)).toEqual({
      notification_prefs: { other: 1, monthly_board_report: false },
    })
  })

  it('starts from nothing when no prefs are stored', () => {
    expect(withMonthlyBoardReportPref(undefined, true)).toEqual({ notification_prefs: { monthly_board_report: true } })
  })

  it('round-trips', () => {
    expect(wantsMonthlyBoardReport(withMonthlyBoardReportPref({}, false))).toBe(false)
    expect(wantsMonthlyBoardReport(withMonthlyBoardReportPref({}, true))).toBe(true)
  })
})
