import { NextResponse } from 'next/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { loadWaitingList } from '@/lib/leases'
import { csvDocument } from '@/lib/csv'

// CSV export of the lease waiting list for the current user's
// association. Returns the full queue history (waiting + approved +
// denied + withdrawn) so managers can audit decisions, not just see the
// open queue.
//
// loadWaitingList() scopes by association_id, reads through the
// user-session supabase client (RLS-enforced) and pages past PostgREST's
// 1000-row cap (BL-053). A failed read is a 500, never a short file.

export async function GET() {
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return NextResponse.json(
      { error: 'no_association', message: 'No association configured for this HOA.' },
      { status: 400 },
    )
  }

  // loadWaitingList returns every status (no status filter), so we get
  // waiting + approved + denied + withdrawn out of the box.
  const waiting = await loadWaitingList(assoc.id)
  if (!waiting) {
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const header = [
    'Property address',
    'Unit',
    'Owner name',
    'Status',
    'Requested',
    'Status updated',
    'Notes',
  ]
  const body = csvDocument(
    header,
    waiting.map((r) => [
      r.property_address,
      r.property_unit_number ?? '',
      r.owner_name ?? '',
      r.status,
      r.requested_at,
      r.status_updated_at ?? '',
      r.notes ?? '',
    ]),
  )

  const today = new Date().toISOString().slice(0, 10)
  const filename = `leases-waiting-list-${today}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
