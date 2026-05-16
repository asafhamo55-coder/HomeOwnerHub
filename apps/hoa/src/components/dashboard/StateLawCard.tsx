import Link from 'next/link'
import { Scale, Sparkles } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { getStateLawSummary } from '@/lib/state-law'

const STATE_NAME: Record<'GA' | 'FL' | 'CA' | 'TX', string> = {
  GA: 'Georgia',
  FL: 'Florida',
  CA: 'California',
  TX: 'Texas',
}

export async function StateLawCard() {
  const summary = await getStateLawSummary()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            State Law
          </CardTitle>
          {summary.state ? <Badge variant="outline">{summary.state}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!summary.state ? (
          <p className="text-sm text-muted-fg">
            State-specific law coverage opens once your association is in
            one of the v1 states (GA, FL, CA, TX).
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {summary.statuteCount > 0 ? (
                <>
                  <span className="text-2xl font-semibold">{summary.statuteCount}</span>{' '}
                  <span className="text-xs text-muted-fg">
                    {STATE_NAME[summary.state]} statute sections indexed
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-fg">
                  No statutes ingested yet for {STATE_NAME[summary.state]}.
                </span>
              )}
            </p>

            {summary.recentUpdateCount > 0 ? (
              <p className="text-xs">
                <Badge variant="warning" size="sm">
                  {summary.recentUpdateCount} recent update{summary.recentUpdateCount === 1 ? '' : 's'}
                </Badge>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/legal/ask">
                  <Sparkles className="h-4 w-4" />
                  Ask the law
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/legal">Open</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
