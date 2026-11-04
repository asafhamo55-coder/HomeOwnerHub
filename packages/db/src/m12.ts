/**
 * Migration batch M12 (migrations/0077_public_site.sql) switch.
 *
 * true: 0077 was applied in production on 2026-11-05. Every
 * code path that reads or writes public_sites or public_site_items checks
 * this first, and with it false the app behaves as it did before M12 (the
 * public /s/<slug> page answers 404, the board settings page says the
 * feature is not ready).
 *
 * Flipped to true after the owner confirmed the apply. Covers:
 *   BL-038 public community page per HOA
 *          public_sites, public_site_items
 *          apps/hoa/src/lib/public-site/ (content.ts is pure and flag-free)
 *          apps/hoa/src/app/s/[slug]            (public page + document links)
 *          apps/hoa/src/app/(dashboard)/settings/public-site (board builder)
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M12_APPLIED: boolean = true
