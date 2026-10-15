import { Gavel } from 'lucide-react'
import { Card, CardContent } from '@homeowner-portal/ui'

// Centered sign-in card for the Eviction Hub auth pages (login, signup, verify).
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-xs">
            <Gavel className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-lg font-semibold tracking-tight text-foreground">Eviction Hub</p>
            <p className="text-sm text-muted">Compliant eviction filings, every time.</p>
          </div>
        </div>
        <Card>
          <CardContent className="p-6">{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}
