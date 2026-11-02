import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { loadPublicDocument } from '@/lib/public-site/load'

// GET /s/{slug}/documents/{itemId}: open one document the board put on the
// public page. No session. The lookup (lib/public-site/load.ts) answers only
// for a published site and an item on it; the file is then signed for a
// minute and the visitor is redirected. Not found, unpublished and not
// allowed all answer the same 404.

export const dynamic = 'force-dynamic'

const SIGNED_URL_SECONDS = 60

function notFound(): NextResponse {
  const res = new NextResponse('Not found', { status: 404 })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug, itemId } = await params
  const target = await loadPublicDocument(slug, itemId)
  if (!target) return notFound()

  const { data, error } = await createAdminClient().storage.from(target.bucket).createSignedUrl(target.path, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) {
    console.error('[public-site] sign failed', { name: error?.name ?? 'no url' })
    return notFound()
  }
  const res = NextResponse.redirect(data.signedUrl, 303)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
