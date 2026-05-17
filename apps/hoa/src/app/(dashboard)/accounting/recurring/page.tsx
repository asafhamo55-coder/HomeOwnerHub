import Link from 'next/link'
import { ChevronLeft, Repeat } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Recurring Entries' }

interface RuleRow {
  id: string
  cadence: string
  next_run_date: string
  is_active: boolean
  template: { id: string; entry_number: string; memo: string } | null
}

export default async function RecurringPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Repeat className="h-10 w-10" aria-hidden />}
          title="No recurring entries"
          description="This area is empty. Contact support to set up accounting for your association."
        />
      </div>
    )
  }

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('recurring_journal_entries')
    .select(
      'id, cadence, next_run_date, is_active, template:template_je_id(id, entry_number, memo)',
    )
    .eq('association_id', ctx.associationId)
    .order('next_run_date', { ascending: true })

  const rules = (data ?? []) as unknown as RuleRow[]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Accounting
        </Link>
        <h1>Recurring Entries</h1>
        <p className="text-sm text-muted">
          Set up a template once and we post it on a regular schedule —
          monthly, quarterly, or annually. New entries appear in your ledger
          automatically each cycle.
        </p>
      </header>

      {rules.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-10 w-10" aria-hidden />}
          title="No recurring entries yet"
          description="Recurring entries can't be added from the portal yet. Talk to your bookkeeper or contact support to set one up."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium">Cadence</th>
                <th className="px-4 py-2 font-medium">Next run</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    {r.template ? (
                      <Link
                        href={`/accounting/ledger/${r.template.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {r.template.entry_number}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                    {r.template ? (
                      <span className="ml-2 text-foreground">{r.template.memo}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{r.cadence}</td>
                  <td className="px-4 py-2 text-muted">
                    {format(new Date(r.next_run_date), 'PP')}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={r.is_active ? 'success' : 'outline'} size="sm">
                      {r.is_active ? 'active' : 'paused'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
