// What the property page needs to draw the upload control (M20).
// Flag off: null, with no query. Otherwise null also when the reader may not
// change this home's photo, so nothing is rendered for them.

import { M20_APPLIED } from '@homeowner-portal/db/m20'
import { logRouteFailure } from '@/lib/api/log'
import { canChangePhoto, isOwnPhotoPath, type PhotoRole } from './rules'
import type { PhotoServerClient } from './serve'

export interface PhotoUploadView {
  hasUpload: boolean
  /** Changes whenever the photo does, so the page re-draws the picture. */
  version: string | null
}

export async function loadPhotoUpload(
  supabase: PhotoServerClient,
  input: { orgId: string; propertyId: string; role: PhotoRole },
  flagOn: boolean = M20_APPLIED,
): Promise<PhotoUploadView | null> {
  if (!flagOn) return null
  const { orgId, propertyId, role } = input
  try {
    let residentPropertyIds: string[] = []
    if (role === 'resident') {
      const { data } = await supabase.rpc('auth_resident_property_ids')
      residentPropertyIds = data ?? []
    }
    if (!canChangePhoto({ role, propertyId, residentPropertyIds })) return null
    const { data, error } = await supabase
      .from('hoa_properties')
      .select('photo_path, photo_updated_at')
      .eq('id', propertyId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle<{ photo_path: string | null; photo_updated_at: string | null }>()
    if (error || !data) {
      if (error) logRouteFailure('properties.photo.upload.page', error, { orgId, propertyId })
      return null
    }
    const hasUpload = isOwnPhotoPath(data.photo_path, orgId, propertyId)
    return { hasUpload, version: hasUpload ? (data.photo_updated_at ?? 'uploaded') : null }
  } catch (err) {
    logRouteFailure('properties.photo.upload.page', err, { orgId, propertyId })
    return null
  }
}
