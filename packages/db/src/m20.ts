/**
 * Migration batch M20 (migrations/0086_property_photos.sql) switch.
 *
 * false: 0086 is not applied in production yet. Every code path that reads
 * hoa_properties.photo_path, calls set_property_photo() or touches the
 * property-photos bucket checks this first. With it false the app behaves as
 * it did before M20: no upload control, no upload route, the property photo is
 * Street View only.
 *
 * Flip to true in its own commit, after the owner applies 0086 and every
 * verify-0086 check reads PASS (OA-55). Covers:
 *   upload your own house photo
 *      hoa_properties.photo_path / photo_updated_at / photo_updated_by,
 *      set_property_photo(), the private property-photos bucket:
 *      apps/hoa/src/lib/properties/photo-upload/ and
 *      apps/hoa/src/app/api/properties/[id]/photo/upload/
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M20_APPLIED: boolean = false
