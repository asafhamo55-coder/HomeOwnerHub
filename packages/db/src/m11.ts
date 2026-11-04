/**
 * Migration batch M11 (migrations/0076_amenity_reservations.sql) switch.
 *
 * true: 0076 was applied in production on 2026-11-05. Every
 * code path that reads or writes an M11 table checks this first, and with it
 * false the app behaves as it did before M11.
 *
 * Flipped to true after the owner confirmed the apply. Covers:
 *   BL-034 amenity reservations
 *          amenities, amenity_reservations, and the no-overlap trigger:
 *          apps/hoa/src/lib/amenities/ (model.ts is pure and flag-free)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M11_APPLIED: boolean = true
