/**
 * Migration batch M12 (migrations/0077_public_site.sql) switch.
 *
 * false: 0077 is a draft the owner has not applied in production yet. Every
 * code path that reads or writes public_sites or public_site_items checks
 * this first, and with it false the app behaves exactly as before M12 (the
 * public /s/<slug> page answers 404, the board settings page says the
 * feature is not ready) and keeps working when the objects already exist
 * (CI replays 0077, so the integration suite runs "objects present, flag
 * false").
 *
 * Flipping it to true is the one-line follow-up after the owner confirms the
 * apply. Covers:
 *   BL-038 public community page per HOA
 *          public_sites, public_site_items
 *          apps/hoa/src/lib/public-site/ (content.ts is pure and flag-free)
 *          apps/hoa/src/app/s/[slug]            (public page + document links)
 *          apps/hoa/src/app/(dashboard)/settings/public-site (board builder)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M12_APPLIED: boolean = false
