import { notFound } from 'next/navigation'
import { Gallery } from './Gallery'

// Dev-only component gallery: every design-system component in every
// state, inside a demo AppShell, with no data and no auth. It is what
// `pnpm ui:shots` screenshots (scripts/ui-shots.ts) — the visual check an
// agent can run without a human browser. 404 in production builds.
// Spec: docs/specs/2026-10-15-design-system-v2.md.

export const metadata = { title: 'UI gallery' }
export const dynamic = 'force-dynamic'

export default async function UiGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ overlay?: string; section?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { overlay, section } = await searchParams
  return <Gallery overlay={overlay ?? null} section={section ?? null} />
}
