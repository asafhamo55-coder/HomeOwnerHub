import { NextResponse } from 'next/server'
import { reportError } from '@homeowner-portal/observability/report'
import { getCurrentOrg } from '@/lib/orgs'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  SIGNED_URL_SECONDS,
  fetchResidentDocumentFile,
  isUuid,
  parseDocSource,
} from '@/lib/resident-documents/query'

// GET /resident/documents/{hoa|governing}/{id} — open one association
// document the way an owner gets it (BL-049).
//
// Route handlers do not run the resident layout, so this checks for
// itself: a signed-in member of the current org (any role — the board's
// "Posted for owners" link opens the same copy), and a document that is in
// that org and on the resident allowlist with a stored file. Everything
// runs through the user's OWN client: RLS scopes the row read, and the
// storage SELECT policy (0055/0056: org-prefixed objects, members read)
// scopes the signing. Never service role.
//
// The signed URL lives SIGNED_URL_SECONDS and is used at once by the
// redirect, so a copied link stops working within a minute; the stable,
// shareable link is this route, which re-checks every time.
//
// Not found, not allowed and no file all land on the same "isn't
// available" notice, so the response does not reveal which documents
// exist. Logs ids and codes only.

export const dynamic = 'force-dynamic'

function back(request: Request, reason: 'unavailable' | 'failed'): NextResponse {
  const res = NextResponse.redirect(new URL(`/resident/documents?open=${reason}`, request.url), 303)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  const { source: rawSource, id } = await params
  const source = parseDocSource(rawSource)
  if (!source || !isUuid(id)) return back(request, 'unavailable')

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?redirect=/resident/documents', request.url), 303)
  }

  const org = await getCurrentOrg()
  if (!org) return back(request, 'unavailable')
  const role = await getEffectiveRoleInOrg(org.id)
  if (!role) return back(request, 'unavailable')

  let target
  try {
    target = await fetchResidentDocumentFile(supabase, org.id, source, id)
  } catch (e) {
    reportError(e instanceof Error ? e : new Error('resident document read failed'), 'resident-documents', {
      source,
      documentId: id,
    })
    return back(request, 'failed')
  }
  if (!target) return back(request, 'unavailable')

  const { data, error } = await supabase.storage.from(target.bucket).createSignedUrl(target.path, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) {
    // A missing object and a refused one both come back here.
    reportError(new Error(`resident document sign failed (${error?.name ?? 'no url'})`), 'resident-documents', {
      source,
      documentId: id,
    })
    return back(request, 'failed')
  }

  const res = NextResponse.redirect(data.signedUrl, 303)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
