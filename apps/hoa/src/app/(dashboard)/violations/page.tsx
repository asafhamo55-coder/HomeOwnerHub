import Link from 'next/link'
import { AlertTriangle, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Violations' }

interface ViolationRow {
  id: string
  description: string
  status: string
  severity: string | null
  ccr_section: string | null
  created_at: string | null
  notice_sent_at: string | null
  property: { address: string; unit_number: string | null } | null
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  open: 'outline',
  notice_sent: 'warning',
  cured: 'success',
  resolved: 'success',
  fined: 'destructive',
  escalated: 'destructive',
}

export default async function ViolationsListPage() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_violations')
    .select(
      'id, description, status, severity, ccr_section, created_at, notice_sent_at, property:hoa_properties(address, unit_number)',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = (data ?? []) as unknown as ViolationRow[]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">Violations</h1>
          <p className="text-sm text-muted-fg">
            {rows.length} on file (showing most recent first)
          </p>
        </div>
        <Button asChild>
          <Link href="/violations/new">
            <Plus className="h-4 w-4" />
            Report violation
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" aria-hidden />}
          title="No violations on file"
          description="Report your first violation. Covenant Brain will match it to a CC&R section and draft the letter."
          action={
            <Button asChild>
              <Link href="/violations/new">
                <Plus className="h-4 w-4" />
                Report first violation
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/violations/${v.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-muted">{v.description}</p>
                    <p className="text-xs text-muted-fg">
                      {v.property?.address ?? 'Property unknown'}
                      {v.property?.unit_number ? ` · ${v.property.unit_number}` : ''}
                      {v.ccr_section ? ` · ${v.ccr_section}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-fg">
                      {v.created_at ? format(new Date(v.created_at), 'PP') : ''}
                      {v.notice_sent_at ? ` · notice sent ${format(new Date(v.notice_sent_at), 'PP')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {v.severity ? (
                      <Badge variant="outline" size="sm">
                        {v.severity}
                      </Badge>
                    ) : null}
                    <Badge variant={STATUS_VARIANT[v.status] ?? 'outline'} size="sm">
                      {v.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
