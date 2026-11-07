// Pure rules for "upload your own house photo" (M20). No sharp, no database,
// no imports from the app, so client components and tests can use it.

import { M20_APPLIED } from '@homeowner-portal/db/m20'

export const PHOTO_BUCKET = 'property-photos'
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const PHOTO_MAX_WIDTH = 1600
/** Seconds a signed link to the stored photo lives. */
export const PHOTO_SIGNED_URL_SECONDS = 60

/** Allowed upload types. Maps, not objects: a client controls the keys. */
export const PHOTO_TYPES: ReadonlyMap<string, string> = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
])

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

/** The allowlisted MIME type for a file, or null. Octet-stream falls back to the extension. */
export function resolvePhotoType(file: { type: string; name: string }): string | null {
  const declared = file.type.split(';')[0]!.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') return PHOTO_TYPES.has(declared) ? declared : null
  const dot = file.name.lastIndexOf('.')
  if (dot <= 0) return null
  return TYPE_BY_EXTENSION.get(file.name.slice(dot + 1).toLowerCase()) ?? null
}

/** Where the one photo of a home lives. Built server-side from ids, never from a file name. */
export function uploadedPhotoPath(orgId: string, propertyId: string): string {
  return `${orgId}/${propertyId}/front.jpg`
}

/** A stored path is trusted only when it is exactly this org's and this home's. */
export function isOwnPhotoPath(path: string | null | undefined, orgId: string, propertyId: string): path is string {
  return typeof path === 'string' && path === uploadedPhotoPath(orgId, propertyId)
}

export type PhotoRole = 'admin' | 'board' | 'resident'

/**
 * Who may upload, replace or remove: board and admin for any home in their
 * org; an owner or resident only for a home they belong to. `residentPropertyIds`
 * is what the database says the caller is linked to (auth_resident_property_ids).
 * The database function repeats this check.
 */
export function canChangePhoto(input: { role: PhotoRole; propertyId: string; residentPropertyIds: readonly string[] }): boolean {
  if (input.role === 'admin' || input.role === 'board') return true
  if (input.role === 'resident') return input.residentPropertyIds.includes(input.propertyId)
  return false
}

/** An uploaded photo always wins over Street View. */
export function choosePhotoSource(input: { photoPath: string | null | undefined; flagOn?: boolean }): 'upload' | 'street_view' {
  const flagOn = input.flagOn ?? M20_APPLIED
  return flagOn && input.photoPath ? 'upload' : 'street_view'
}

/** Whether any upload UI or action exists at all. */
export function photoUploadEnabled(flagOn: boolean = M20_APPLIED): boolean {
  return flagOn
}

export const PHOTO_UPLOAD_HINT = 'Or upload your own photo'
