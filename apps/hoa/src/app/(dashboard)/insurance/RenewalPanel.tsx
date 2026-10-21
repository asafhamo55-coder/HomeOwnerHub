import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import { INSURANCE_NOT_LEGAL_ADVICE, POLICY_KIND_LABELS, formatCents } from '@/lib/insurance/model'
import { formatPct, type FidelityAdequacy, type RenewalComparison, type TermChange } from '@/lib/insurance/analysis'

// BL-142: renewed policies against their previous term, and the fidelity
// bond against the money held today. Server component; read-only.

const DIRECTION_CLASS: Record<TermChange['direction'], string> = {
  better: 'text-success',
  worse: 'text-danger',
  same: 'text-muted',
  unknown: 'text-muted',
}

function ChangeCell({ c }: { c: TermChange }) {
  const pct = formatPct(c.pct)
  const Icon = c.deltaCents === null || c.deltaCents === 0 ? Minus : c.deltaCents > 0 ? ArrowUpRight : ArrowDownRight
  const label =
    c.direction === 'unknown'
      ? 'Not recorded on both terms'
      : c.direction === 'same'
        ? 'No change'
        : `${c.direction === 'better' ? 'Better' : 'Worse'} for the association`
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{c.label}</dt>
      <dd className="num">
        {formatCents(c.previousCents)} → {formatCents(c.currentCents)}
      </dd>
      <dd className={`flex items-center gap-1 text-xs ${DIRECTION_CLASS[c.direction]}`}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>
          {c.deltaCents !== null && c.deltaCents !== 0 ? (
            <span className="num">
              {c.deltaCents > 0 ? '+' : '−'}
              {formatCents(Math.abs(c.deltaCents))}
              {pct ? ` (${pct})` : null}
              {' · '}
            </span>
          ) : null}
          {label}
        </span>
      </dd>
    </div>
  )
}

export function RenewalPanel({ comparisons }: { comparisons: RenewalComparison[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Renewals</CardTitle>
        <CardDescription>
          Each renewed policy against its previous term: premium, limit and deductible. A previous term is the same kind of
          policy from the same insurance company that ended within a day of the new one starting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {comparisons.length === 0 ? (
          <p className="text-sm text-muted">
            No renewals to compare yet. When you renew, add the new term as its own policy with its start date; if the
            insurance company changed, the two terms aren’t compared.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {comparisons.map((r) => (
              <li key={r.current.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">
                    {POLICY_KIND_LABELS[r.current.kind]}
                    <span className="font-normal text-muted"> · {r.current.carrier}</span>
                  </p>
                  {r.hasWorse ? <StatusPill tone="warning" label="Review changes" /> : <StatusPill tone="success" label="No worse terms" />}
                </div>
                <p className="text-xs text-muted">
                  {r.previous.effectiveOn ? `${r.previous.effectiveOn} to ` : 'Until '}
                  {r.previous.expiresOn} → {r.current.effectiveOn} to {r.current.expiresOn}
                </p>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {r.changes.map((c) => (
                    <ChangeCell key={c.field} c={c} />
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function FidelityPanel({
  rows,
}: {
  rows: Array<{ associationId: string; associationName: string | null; result: { ok: true; data: FidelityAdequacy } | { ok: false } }>
}) {
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Fidelity bond vs money held</CardTitle>
        <CardDescription>
          The fidelity bond’s limit against today’s reserve balance plus operating cash, from your books.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows.map((row) => (
          <section
            key={row.associationId}
            aria-label={row.associationName ? `Fidelity bond, ${row.associationName}` : 'Fidelity bond'}
            className="space-y-3 text-sm"
          >
            {row.associationName ? <h3 className="font-medium text-foreground">{row.associationName}</h3> : null}
            {!row.result.ok ? (
              <p className="text-muted">Couldn’t load the balances from your books. Reload to try again.</p>
            ) : (
              <FidelityBody f={row.result.data} />
            )}
          </section>
        ))}
        <p className="text-xs text-muted">{INSURANCE_NOT_LEGAL_ADVICE}</p>
      </CardContent>
    </Card>
  )
}

function FidelityBody({ f }: { f: FidelityAdequacy }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Bond limit</dt>
          <dd className="num">{formatCents(f.bondLimitCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Reserve balance</dt>
          <dd className="num">{formatCents(f.reserveCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Operating cash</dt>
          <dd className="num">{formatCents(f.operatingCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Held today</dt>
          <dd className={`num ${f.status === 'short' ? 'font-medium text-danger' : ''}`}>{formatCents(f.heldCents)}</dd>
        </div>
      </dl>
      <div className="flex gap-2">
        {f.severity === 'warn' ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warning" />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Note" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-foreground">
            {f.status === 'short' && f.shortfallCents !== null ? (
              <span className="num font-medium">Short by {formatCents(f.shortfallCents)}. </span>
            ) : null}
            {f.message}
          </p>
          {f.citations.map((c) => (
            <blockquote key={c.quote.slice(0, 24)} className="border-l-2 border-border pl-3 text-xs text-foreground-secondary">
              “{c.quote}” <cite className="not-italic text-muted">({c.cite})</cite>
            </blockquote>
          ))}
        </div>
      </div>
    </>
  )
}
