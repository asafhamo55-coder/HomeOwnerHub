import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, KeyValue, KeyValueList } from '@homeowner-portal/ui'
import { Scale } from 'lucide-react'
import type { CollectionCase, CollectionEvent } from '@/lib/collections/queries'
import {
  collectionEventLabel,
  collectionStatusLabel,
  collectionStatusTone,
} from '@/lib/collections/statuses'
import { RecordCollectionEvent } from './RecordCollectionEvent'
import { OpenCollectionCase } from './OpenCollectionCase'

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

/** Badge variant per tone. `warning` and `destructive` both exist in the kit. */
function toneVariant(tone: ReturnType<typeof collectionStatusTone>) {
  return tone === 'destructive' ? 'destructive' : tone === 'warning' ? 'warning' : 'neutral'
}

/**
 * The collections file for one property.
 *
 * Read-mostly by design: this records what the manager and attorney did
 * elsewhere. Nothing here sends a letter — see the "Deliberately not built"
 * block in migrations/0047_collections.sql.
 */
export function CollectionsSection({
  unitId,
  openCase,
  events,
  closedCases,
}: {
  unitId: string | null
  openCase: CollectionCase | null
  events: CollectionEvent[]
  closedCases: CollectionCase[]
}) {
  // No bridged unit means no case can exist: collection_cases.unit_id is
  // NOT NULL and references units(id). Say so plainly rather than showing
  // an "Open a case" button that would fail on submit.
  if (!unitId) {
    return (
      <EmptyState
        icon={<Scale className="h-8 w-8" aria-hidden />}
        title="No unit record"
        description="Collections attaches to a unit, and this property has no unit linked yet. Link one to open a collections case."
      />
    )
  }

  if (!openCase) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={<Scale className="h-8 w-8" aria-hidden />}
          title="No open collections case"
          description="Open a case to record collection letters, lien notices, and attorney activity for this property."
        />
        <OpenCollectionCase unitId={unitId} />
        {closedCases.length > 0 ? <ClosedCases cases={closedCases} /> : null}
      </div>
    )
  }

  const tone = collectionStatusTone(openCase.status)

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Collections</CardTitle>
          <Badge variant={toneVariant(tone)}>{collectionStatusLabel(openCase.status)}</Badge>
        </CardHeader>
        <CardContent>
          <KeyValueList>
            <KeyValue label="Opened" value={openCase.openedOn} />
            <KeyValue label="Attorney" value={openCase.attorneyFirm ?? '—'} />
            {openCase.attorneyReference ? (
              <KeyValue label="Their file no." value={openCase.attorneyReference} />
            ) : null}
          </KeyValueList>
        </CardContent>
      </Card>

      <RecordCollectionEvent caseId={openCase.id} currentStatus={openCase.status} />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              Nothing recorded yet. Add the actions already taken — the dates matter more than the
              detail.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 px-4 py-3 text-sm">
                  {/* occurred_on is the action date the manager typed, not
                      when the row was created. Tabular numerals keep the
                      dates aligned down the column. */}
                  <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-muted">
                    {e.occurredOn}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">
                      {collectionEventLabel(e.eventType)}
                    </span>
                    {e.amount !== null ? (
                      <span className="ml-2 font-mono text-xs tabular-nums text-muted">
                        {money(e.amount)}
                      </span>
                    ) : null}
                    {e.note ? <span className="block text-muted">{e.note}</span> : null}
                  </span>
                  {e.actorInitials ? (
                    <span className="shrink-0 text-xs uppercase text-muted">{e.actorInitials}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted">
        This is a record of actions taken elsewhere. HomeownerHub does not send collection notices,
        and entries cannot be edited or deleted — correct a mistake by adding a note.
      </p>

      {closedCases.length > 0 ? <ClosedCases cases={closedCases} /> : null}
    </div>
  )
}

function ClosedCases({ cases }: { cases: CollectionCase[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Earlier cases</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {cases.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
              <span className="text-muted">
                {c.openedOn} → {c.closedOn ?? '—'}
              </span>
              <span className="flex items-center gap-2">
                {c.closedReason ? (
                  <span className="text-xs text-muted">{c.closedReason}</span>
                ) : null}
                <Badge variant="neutral">{collectionStatusLabel(c.status)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
