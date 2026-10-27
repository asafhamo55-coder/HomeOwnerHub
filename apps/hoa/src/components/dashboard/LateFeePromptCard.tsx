import Link from 'next/link'
import { Scale } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { LATE_FEE_SETTINGS_HREF, type LateFeePrompt } from '@/lib/late-fees/dashboard-prompt'
import { DismissLateFeePromptButton } from './DismissLateFeePromptButton'

/**
 * BL-147: a Georgia association with no late-fee policy. Says plainly that
 * no late fee is being charged, quotes the statute (verbatim, from law.ts)
 * and links to Settings → Late fees. Board-facing only; the section that
 * renders it checks the role. Dismissible.
 */
export function LateFeePromptCard({ prompt }: { prompt: LateFeePrompt }) {
  const { law } = prompt
  return (
    <Card id="late-fee-prompt">
      <CardHeader className="pb-3">
        <CardTitle as="h2" className="flex items-center gap-2">
          <Scale className="size-4 text-muted" aria-hidden />
          Set your late-fee policy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-foreground-secondary">
          Your board hasn’t saved a late-fee policy, so HomeownerHub adds no late fee to any overdue charge. In{' '}
          {law.stateName}, {law.citation} says:
        </p>
        <blockquote className="space-y-1 border-l-2 border-border pl-3 text-foreground-secondary">
          {law.quotes.map((q) => (
            <p key={q}>“{q}”</p>
          ))}
        </blockquote>
        <p className="text-foreground-secondary">
          If your declaration provides for a late charge, set the amount and grace period. Check the statute on the official
          Code before relying on this. Informational, not legal advice.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href={LATE_FEE_SETTINGS_HREF}>Set late-fee policy</Link>
          </Button>
          <DismissLateFeePromptButton />
        </div>
      </CardContent>
    </Card>
  )
}
