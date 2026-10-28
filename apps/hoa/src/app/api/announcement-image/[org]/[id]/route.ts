import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { zUuid } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { announcementImageContentType, isAnnouncementImageId } from '@/lib/announcements/inline-images'

/**
 * GET /api/announcement-image/<orgId>/<uuid>.<ext>
 *
 * The picture inside an announcement email. Mail clients fetch it with no
 * session, so this path is public (middleware PUBLIC_PREFIXES). The 122-bit
 * random uuid in the name is the authorization, as with the vendor token
 * routes. It reads ONLY `<orgId>/announcement-images/<id>` from the private
 * hoa-documents bucket with the service role, so no other document is
 * reachable through it, and serves only the four image types, nosniff.
 */
const Params = z.object({
  org: zUuid,
  id: z.string().refine(isAnnouncementImageId),
})

export const GET = withRoute(
  'announcement-image.get',
  async (_request: Request, ctx: { params: Promise<{ org: string; id: string }> }) => {
    // A malformed name is an unknown image (RC-5), not a validation error.
    const check = Params.safeParse(await ctx.params)
    if (!check.success) throw new ApiRouteError('not_found')
    const parsed = check.data
    const contentType = announcementImageContentType(parsed.id)
    if (!contentType) throw new ApiRouteError('not_found')

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from('hoa-documents').download(`${parsed.org}/announcement-images/${parsed.id}`)
    if (error || !data) {
      if (error) logRouteFailure('announcement-image.get', error, { orgId: parsed.org })
      throw new ApiRouteError('not_found')
    }
    return new Response(await data.arrayBuffer(), {
      status: 200,
      headers: {
        'content-type': contentType,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
        'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    })
  },
)
