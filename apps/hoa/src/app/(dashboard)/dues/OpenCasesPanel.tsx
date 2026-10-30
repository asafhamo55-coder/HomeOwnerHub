import Link from 'next/link'
import { Alert, Card, CardDescription, CardHeader, CardTitle, DataTable, StatusPill } from '@homeowner-portal/ui'
import { M7_APPLIED } from '@homeowner-portal/db/m7'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/association-time'
import { listOpenCases } from '@/lib/collections/queries'
import type { OpenCaseRow } from '@/lib/collections/open-cases'
import { collectionEventLabel, collectionStatusLabel, collectionStatusTone } from '@/lib/collections/statuses'
import { asPropertyId } from '@/lib/properties/resolve'
import { propertyHref } from '@/lib/properties/href'
import { formatDay } from '@/lib/money/format'
import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE = 25

const TONE = { neutral: 'neutral', warning: 'warning', destructive: 'danger' } as const

/**
 * Read-only overview of every open collection case, longest quiet first.
 * Links to each property's collections file; nothing here sends, posts or
 * changes a balance.
 */
export async function OpenCasesPanel({ orgId, timeZone }: { orgId: string; timeZone: string }) {
  let page: Awaited<ReturnType<typeof listOpenCases>>
  try {
    const supabase = await getSupabaseServerClient()
    page = await listOpenCases(supabase as unknown as SupabaseClient, orgId, todayIn(timeZone), { limit: PAGE })
  } catch (e) {
    console.error('OpenCasesPanel: listOpenCases failed', { message: e instanceof Error ? e.message : String(e) })
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Open collection cases</CardTitle>
        </CardHeader>
        <div className="px-5 pb-5">
          <Alert variant="error">Couldn&rsquo;t load the open cases. Refresh to try again.</Alert>
        </div>
      </Card>
    )
  }

  const { rows, total } = page
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle as="h2">Open collection cases ({total})</CardTitle>
        <CardDescription>Quietest first. Each unit opens its collections file.</CardDescription>
      </CardHeader>
      {total === 0 ? (
        <p className="border-t border-border px-5 py-6 text-sm text-muted">No open collection cases.</p>
      ) : (
        <DataTable<OpenCaseRow>
          framed={false}
          density="compact"
          mobile="cards"
          caption="Open collection cases"
          rows={rows}
          rowKey={(r) => r.caseId}
          columns={[
            {
              key: 'unit',
              header: 'Unit',
              mobilePrimary: true,
              cell: (r) => (
                <Link className="font-medium text-primary hover:underline" href={propertyHref(asPropertyId(r.linkId))}>
                  {r.unitLabel}
                </Link>
              ),
            },
            {
              key: 'stage',
              header: 'Stage',
              cell: (r) => (
                <StatusPill tone={TONE[collectionStatusTone(r.status)]} label={collectionStatusLabel(r.status)} size="sm" />
              ),
            },
            { key: 'open', header: 'Days open', numeric: true, cell: (r) => r.daysOpen },
            {
              key: 'quiet',
              header: 'Days since last event',
              numeric: true,
              cell: (r) => (
                <span title={r.lastEventOn && r.lastEventType ? `${collectionEventLabel(r.lastEventType)} on ${formatDay(r.lastEventOn)}` : 'No events yet'}>
                  {r.daysSinceLastEvent}
                </span>
              ),
            },
            { key: 'firm', header: 'Firm', cell: (r) => r.attorneyFirm ?? 'Not recorded' },
            ...(M7_APPLIED
              ? [
                  {
                    key: 'mail',
                    header: 'Mail clock',
                    cell: (r: OpenCaseRow) =>
                      r.mailDeliveredOn ? `Delivered ${formatDay(r.mailDeliveredOn)}, day ${r.mailClockDay}` : 'No delivery recorded',
                  },
                ]
              : []),
          ]}
        />
      )}
      {total > rows.length ? (
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          Showing the {rows.length} longest-waiting of {total} open cases.
        </p>
      ) : null}
    </Card>
  )
}
