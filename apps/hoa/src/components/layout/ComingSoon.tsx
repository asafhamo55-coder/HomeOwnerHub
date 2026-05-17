import { Sparkles } from 'lucide-react'
import { Card, CardContent } from '@homeowner-portal/ui'

export function ComingSoon({
  title,
  description,
  week,
}: {
  title: string
  description: string
  week?: string
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {week ? <p className="mt-1 text-sm text-muted">{week}</p> : null}
      </header>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <p className="font-medium text-foreground">Not built yet</p>
          <p className="max-w-sm text-sm text-muted">{description}</p>
        </CardContent>
      </Card>
    </div>
  )
}
