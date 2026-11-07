// Why a home has no street picture, in plain words.
//
// The photo route sends one of these codes in the X-Photo-Reason header on a
// miss (a code only, never the address or anything from Google). The property
// page turns it into a short sentence and, when the board can fix it, a link.

export const PHOTO_REASON_HEADER = 'X-Photo-Reason'

export const PHOTO_REASONS = ['no_key', 'no_address', 'needs_location', 'no_street_view', 'upstream', 'not_visible', 'unknown'] as const
export type PhotoReason = (typeof PHOTO_REASONS)[number]

export function toPhotoReason(value: string | null | undefined): PhotoReason {
  return (PHOTO_REASONS as readonly string[]).includes(value ?? '') ? (value as PhotoReason) : 'unknown'
}

export interface PhotoReasonMessage {
  text: string
  /** Where the board can fix it; omitted when there is nothing to do or the reader cannot act. */
  fix?: { href: string; label: string }
}

const COMMUNITY_LOCATION_HREF = '/settings/association#community-location'

export function photoReasonMessage(reason: PhotoReason, canManage: boolean): PhotoReasonMessage {
  switch (reason) {
    case 'needs_location':
      return canManage
        ? {
            text: "No photo: we need your community's city and ZIP to find this street.",
            fix: { href: COMMUNITY_LOCATION_HREF, label: 'Add the city and ZIP' },
          }
        : { text: "No photo yet: the board needs to add the community's city and ZIP." }
    case 'no_street_view':
      return { text: 'Google has no street picture for this address.' }
    case 'no_key':
      return { text: 'Photos are turned off.' }
    case 'upstream':
      return { text: 'Google could not be reached, try later.' }
    case 'no_address':
      return { text: 'No photo: this home has no street address yet.' }
    default:
      return { text: 'No photo is available for this home.' }
  }
}
