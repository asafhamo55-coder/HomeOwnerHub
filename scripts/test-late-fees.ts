/**
 * scripts/test-late-fees.ts
 *
 * Characterization tests for the late-fee rounding rules in
 * packages/jobs/src/hoa-late-fees.ts (cents precision) and
 * packages/jobs/src/pm-late-fees.ts (whole dollars).
 *
 * The production math is buried inside Inngest cron handlers and is not
 * exported as a standalone function. Rather than refactor those jobs
 * just for testability, this script holds CAPTURED COPIES of the two
 * computations below and asserts the captured behavior. If either job
 * diverges from these helpers, that's a bug — either the job or this
 * test is wrong. Update both deliberately.
 *
 * Source: packages/jobs/src/hoa-late-fees.ts ~line 113:
 *   Math.round(Number(src.amount) * HOA_LATE_FEE_RATE * 100) / 100
 *
 * Source: packages/jobs/src/pm-late-fees.ts ~line 58:
 *   Math.round((amount_due * (late_fee_rate ?? 5)) / 100)
 */

import './_load-env'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Captured copy of the HOA cron's rounding (cents precision).
// rate is a decimal fraction (0.05 = 5%).
function computeHoaLateFee(amount: number, rate: number): number {
  return Math.round(Number(amount) * rate * 100) / 100
}

// Captured copy of the PM cron's rounding (whole dollars).
// rate is a percent (5 = 5%); null collapses to 5 per the default.
function computePmLateFee(amountDue: number, rate: number | null): number {
  const ratePct = rate ?? 5
  return Math.round(((amountDue ?? 0) * ratePct) / 100)
}

function main(): void {
  console.log('HOA late fee math (cents precision):\n')

  // 5% of $345.00 = $17.25 exact, no rounding.
  check(
    'HOA 345.00 @ 5% → 17.25',
    computeHoaLateFee(345.0, 0.05) === 17.25,
    `got ${computeHoaLateFee(345.0, 0.05)}`,
  )

  // 5% of $345.10 = $17.255 → rounds to $17.26 (half-up via Math.round).
  check(
    'HOA 345.10 @ 5% → 17.26',
    computeHoaLateFee(345.1, 0.05) === 17.26,
    `got ${computeHoaLateFee(345.1, 0.05)}`,
  )

  // 5% of $0.50 = $0.025 → rounds to $0.03 (half-up).
  // (The cron then skips fees <= 0 — but the math itself produces 0.03.)
  check(
    'HOA 0.50 @ 5% → 0.03',
    computeHoaLateFee(0.5, 0.05) === 0.03,
    `got ${computeHoaLateFee(0.5, 0.05)}`,
  )

  // Zero source amount → 0 (and the cron skips at <= 0).
  check(
    'HOA 0 @ 5% → 0',
    computeHoaLateFee(0, 0.05) === 0,
    `got ${computeHoaLateFee(0, 0.05)}`,
  )

  console.log('\nPM late fee math (whole dollars):\n')

  // 5% default — rate=null falls back to 5.
  check(
    'PM 1000 @ null (defaults 5%) → 50',
    computePmLateFee(1000, null) === 50,
    `got ${computePmLateFee(1000, null)}`,
  )

  // 7.5% of 1000 = 75.
  check(
    'PM 1000 @ 7.5% → 75',
    computePmLateFee(1000, 7.5) === 75,
    `got ${computePmLateFee(1000, 7.5)}`,
  )

  // 5% of 33 = 1.65 → rounds to 2.
  check(
    'PM 33 @ 5% → 2 (Math.round of 1.65)',
    computePmLateFee(33, 5) === 2,
    `got ${computePmLateFee(33, 5)}`,
  )

  console.log(`\n[test-late-fees] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
