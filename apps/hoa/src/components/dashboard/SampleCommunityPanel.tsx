import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { SAMPLE_BANNER_TEXT } from '@/lib/sample-community/data'
import type { SampleState } from '@/lib/sample-community/core'
import { AddSampleButton, RemoveSampleButton } from './SampleCommunityButtons'

/**
 * Shows one of three things for the sample community:
 *   - sample data exists: the banner, with the remove button;
 *   - no homes at all: the "Try it with a sample community" offer;
 *   - real homes exist and no sample data: nothing (the offer is gone for good).
 */
export function SampleCommunityPanel({ state, variant = 'card' }: { state: SampleState | null; variant?: 'card' | 'compact' }) {
  if (!state) return null

  if (state.sampleHomes > 0) {
    return (
      <Alert variant="info" title="Sample data" actions={<RemoveSampleButton />}>
        {SAMPLE_BANNER_TEXT}
      </Alert>
    )
  }

  if (state.realHomes > 0) return null

  if (variant === 'compact') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Want to look around first? We can fill your account with made-up homes. You can delete them in one click.</p>
        <AddSampleButton />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Look around with sample homes</CardTitle>
        <CardDescription>
          Not ready to add your own homes yet? We will fill your account with 12 made-up homes, a month of dues, a few violations and requests, a draft
          announcement and a meeting. Nothing is sent to anyone. You can remove all of it in one click.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddSampleButton />
      </CardContent>
    </Card>
  )
}
