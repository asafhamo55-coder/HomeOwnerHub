import { Badge, Card, CardContent, CardHeader, CardTitle, LoadFailed } from '@homeowner-portal/ui'
import { GA_17A5_COMPLAINT, GA_17A5_FEE, GA_17A5_STAY, GA_17A5_STAY_ENDS, GA_SB406_2027_IN_FORCE, type DriftCitation } from '@/lib/compliance/statute-drift'
import type { GaComplaintView } from '@/lib/ga-complaints/load'
import { GA_COMPLAINT_STAY_FROM, GA_COMPLAINT_SUBJECT_LABEL, stayLastDay, stayRunsOn } from '@/lib/ga-complaints/model'
import type { LoadResult } from '@/lib/load-or-fail'
import { formatDay } from '@/lib/money/format'
import { AddGaComplaint, ConcludeGaComplaint } from './GaComplaintControls'

/** What the page streams in: the panel's read, or null when the viewer isn't board/admin or the home has no unit. */
export type GaComplaintRead = Promise<LoadResult<GaComplaintView | null>>

/** Every quote this panel shows: each tested word for word against ga-sb406-2026-2027-text.txt. */
export const GA_COMPLAINT_PANEL_QUOTES: readonly DriftCitation[] = [GA_17A5_COMPLAINT, GA_17A5_STAY, GA_17A5_STAY_ENDS, GA_17A5_FEE, GA_SB406_2027_IN_FORCE]

function Quote({ q }: { q: DriftCitation }) {
  return (
    <figure className="space-y-1">
      <blockquote className="border-l-2 border-border pl-3 text-sm text-foreground-secondary">“{q.quote}”</blockquote>
      <figcaption className="text-xs text-muted">{q.cite}</figcaption>
    </figure>
  )
}

/**
 * BL-161: the streamed panel on the collections case. Board/admin only
 * (the page passes no read to anyone else) and Georgia only.
 */
export async function GaComplaintPanel({ read }: { read: GaComplaintRead }) {
  const res = await read
  if (!res.ok) return <LoadFailed what="the Secretary of State complaint record" />
  if (!res.data) return null
  return <GaComplaintCard view={res.data} />
}

export function stayHeadline(view: GaComplaintView): { text: string; variant: 'warning' | 'neutral' | 'destructive' } {
  const s = view.stay
  if (s.kind === 'unverified') return { text: 'Record can’t be verified', variant: 'destructive' }
  if (s.kind === 'none') return { text: 'No stay running', variant: 'neutral' }
  return { text: view.live ? 'Stay running · fines and fees held' : 'Stay recorded · warning only until Jan 1, 2027', variant: 'warning' }
}

export function GaComplaintCard({ view }: { view: GaComplaintView }) {
  const head = stayHeadline(view)
  const from = formatDay(GA_COMPLAINT_STAY_FROM)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle as="h4">Secretary of State complaint</CardTitle>
        <Badge variant={head.variant}>{head.text}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-foreground-secondary">
          {view.live ? `Since ${from}` : `From ${from}`}, when a resident files a complaint with the Georgia Secretary of State, the association may not collect or try
          to collect from them fines or fees the complaint is about or related to, until the hearing officer renders conclusions (or 15 days after, if the stay is
          extended). HomeownerHub can’t tell which charges relate to the complaint, so while a stay runs it holds back every fine and fee for this home: the state law
          check {view.live ? 'blocks' : 'will block'} fines and letters that list fines or fees, and the nightly late-fee job skips this home. Dues are not held back.
          {view.live ? ' The only override is “attorney advised”, and it is recorded.' : ' Before then this is a warning only.'}
        </p>

        {!view.verified ? (
          <p className="text-foreground-secondary">
            The stored record can’t be verified, so a stay can’t be ruled out for any home in this association{view.live ? ' and nothing is collected' : ''}. Record
            the complaints again here.
          </p>
        ) : null}

        {view.complaints.length > 0 ? (
          <ul className="divide-y divide-border rounded border border-border">
            {view.complaints.map((c) => {
              const last = stayLastDay(c)
              const running = stayRunsOn(c, view.today)
              return (
                <li key={c.id} className="space-y-1 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Filed {formatDay(c.filedOn)} · {GA_COMPLAINT_SUBJECT_LABEL[c.subject]}
                    </span>
                    <Badge variant={running ? 'warning' : 'neutral'}>{running ? 'Stay running' : 'Stay ended'}</Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {c.conclusionsOn
                      ? `Conclusions ${formatDay(c.conclusionsOn)}${c.extended ? ' · extended 15 days' : ''} · last stayed day ${formatDay(last!)}`
                      : 'No conclusions recorded yet: the stay runs on.'}
                  </p>
                  <ConcludeGaComplaint unitId={view.unitId} complaint={c} today={view.today} />
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-muted">No complaint recorded for this home.</p>
        )}

        <AddGaComplaint unitId={view.unitId} today={view.today} />

        <div className="space-y-3">
          {GA_COMPLAINT_PANEL_QUOTES.map((q) => (
            <Quote key={q.quote} q={q} />
          ))}
        </div>
        <p className="text-xs text-muted">
          HomeownerHub records what the board tells it; it doesn’t file anything with the Secretary of State. Whether a charge relates to the complaint is for your
          association’s attorney.
        </p>
      </CardContent>
    </Card>
  )
}
