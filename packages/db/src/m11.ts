/**
 * Migration batch M11 (migrations/0076_amenity_reservations.sql) switch.
 *
 * false: 0076 is a draft the owner has not applied in production yet. Every
 * code path that reads or writes an M11 table checks this first, and with it
 * false the app behaves exactly as before M11 and keeps working when the
 * objects already exist (CI replays 0076, so the integration suite runs
 * "objects present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the owner confirms the
 * apply. Covers:
 *   BL-034 amenity reservations
 *          amenities, amenity_reservations, and the no-overlap trigger:
 *          apps/hoa/src/lib/amenities/ (model.ts is pure and flag-free)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M11_APPLIED: boolean = false
