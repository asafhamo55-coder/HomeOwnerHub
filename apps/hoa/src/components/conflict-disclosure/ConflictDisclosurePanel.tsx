import { Alert, Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { fetchVotingBoard } from '@/lib/conflict-disclosure/board'
import { MODE_LABEL, quoteFor } from '@/lib/conflict-disclosure/law'
import { disclosureEntriesView, loadDisclosureStatus } from '@/lib/conflict-disclosure/load'
import { DECISION_LABEL, STATUS_LABEL, type DecisionKind } from '@/lib/conflict-disclosure/model'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DisclosureForm } from './DisclosureForm'

/**
 * BL-165: who has disclosed a conflict of interest for this decision, and
 * the form to record yours. Georgia from 2027-01-01: the decision is
 * blocked until every voting board member has. Before that, Georgia:
 * recommended. Other states: an optional best practice, no statute quoted.
 */
export async function ConflictDisclosurePanel({ decisionKind, decisionId }: { decisionKind: DecisionKind; decisionId: string }) {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return null
  const supabase = await getSupabaseServerClient()
  const load = await loadDisclosureStatus(supabase, gate.orgId, decisionKind, decisionId, fetchVotingBoard)
  if (!load.ok) {
    return (
      <Alert variant="warning" title="Couldn’t load the conflict-of-interest disclosures">
        Reload the page to try again.
      </Alert>
    )
  }
  const status = load.status
  if (!status) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const quote = quoteFor(status.mode)
  const entries = disclosureEntriesView(status)
  const missing = new Set(status.progress.missing)
  const options = status.board
    .filter((b) => (gate.role === 'admin' ? true : b.userId === user?.id))
    .map((b) => ({ userId: b.userId, name: b.fullName }))
  const mine = options.find((o) => o.userId === user?.id)?.userId ?? options[0]?.userId

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle as="h2">Conflict-of-interest disclosure</CardTitle>
        <StatusPill
          tone={status.blocks ? 'danger' : status.mode === 'best_practice' ? 'neutral' : 'warning'}
          label={`${MODE_LABEL[status.mode]}${status.blocks ? ': waiting' : ''}`}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {quote ? (
          <blockquote className="border-l-2 border-border pl-3 text-sm text-foreground-secondary">
            “{quote.quote}”
            <footer className="text-xs text-muted">{quote.cite}</footer>
          </blockquote>
        ) : null}
        <p className="text-sm text-foreground-secondary">
          {status.mode === 'required'
            ? `Before this ${DECISION_LABEL[decisionKind].toLowerCase()} can go ahead, each voting board member records “no conflict” or “conflict: recused”.`
            : status.mode === 'recommended'
              ? `Recommended before this ${DECISION_LABEL[decisionKind].toLowerCase()}: each voting board member records “no conflict” or “conflict: recused”. It becomes required for Georgia associations on Jan 1, 2027.`
              : `Best practice before this ${DECISION_LABEL[decisionKind].toLowerCase()}: each board member records “no conflict” or “conflict: recused”. Optional.`}
        </p>
        {status.board.length === 0 ? (
          <p className="text-sm text-muted">No members have the board role yet, so there is no one to disclose.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {status.board.map((b) => {
              const e = entries.find((x) => x.memberId === b.userId)
              return (
                <li key={b.userId}>
                  <span className="font-medium text-foreground">{b.fullName}</span>
                  {': '}
                  {e ? (
                    <>
                      {STATUS_LABEL[e.status]}
                      {e.note ? <span className="text-foreground-secondary"> ({e.note})</span> : null}
                    </>
                  ) : (
                    <span className={missing.has(b.userId) ? 'text-warning' : 'text-muted'}>Not recorded yet</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {!status.verified ? (
          <p className="text-xs text-warning">The stored disclosures could not be verified, so they are not counted.</p>
        ) : null}
        {options.length > 0 && mine ? (
          <DisclosureForm decisionKind={decisionKind} decisionId={decisionId} members={options} defaultMemberId={mine} />
        ) : null}
      </CardContent>
    </Card>
  )
}
