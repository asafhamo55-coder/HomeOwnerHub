import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'

export const metadata = { title: 'Submission received' }

export default function SubmittedPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <CardTitle>Thanks — we got your submission</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Your details have been forwarded to the HOA for review. They'll
            reach out by email or phone if anything is missing.
          </p>
          <p className="text-muted-fg">
            This link can no longer be used. If you need to update your
            details, please contact the HOA directly.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
