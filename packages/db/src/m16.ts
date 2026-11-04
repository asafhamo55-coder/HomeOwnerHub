/**
 * Migration batch M16 (migrations/0082_money_integrity.sql) switch.
 *
 * false: 0082 is not applied in production yet. The parts that are plain database
 * backstops (closed-period triggers, posted-row immutability, the buyer credit
 * window) need no code and are not gated. This flag gates only the one code path
 * that calls a new database behaviour: booking a refund that failed after the
 * books took it, as reverse_online_payment kind 'refund_failed'
 * (apps/hoa/src/lib/online-payments/reversals.ts). With it false that event is
 * ignored exactly as before, and the code keeps working when the objects already
 * exist (CI replays 0082, so the suite runs "objects present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the owner confirms the apply.
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M16_APPLIED: boolean = false
