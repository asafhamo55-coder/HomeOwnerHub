import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'

export const metadata = { title: 'Bid received' }

export default function SubmittedPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <CardTitle>Thanks — your bid is in</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Your bid has been submitted to the HOA for review. They'll
            evaluate alongside any other bids received and reach out about
            next steps.
          </p>
          <p className="text-muted">
            This link can no longer be used to submit. If you need to
            change something, please contact the HOA directly.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
