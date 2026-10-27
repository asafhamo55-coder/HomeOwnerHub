import Link from 'next/link'
import { Card, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadMyMatters } from '@/lib/professionals/load'

export const metadata = { title: 'My matters' }
export const dynamic = 'force-dynamic'

export default async function MyMattersPage() {
  const { org } = await requireRole(['attorney'] as const)
  const result = await loadMyMatters(await getSupabaseServerClient(), org.id)
  if (!result.ok) {
    return (
      <Page title="My matters">
        <LoadFailed what="your matters" retryHref="/pro/matters" />
      </Page>
    )
  }
  return (
    <Page title="My matters" description="The matters the board assigned to you. You see nothing else.">
      {result.matters.length === 0 ? (
        <EmptyState title="No matters assigned yet" description="The board assigns collections cases, violations and records requests to you from Settings → Professionals." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {result.matters.map((m) => (
              <li key={`${m.type}:${m.id}`}>
                <Link href={`/pro/matters/${m.type}/${m.id}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-subtle">
                  <span className="font-medium">{m.title}</span>
                  <span className="text-foreground-secondary">
                    {m.status} · since {m.since}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  )
}
