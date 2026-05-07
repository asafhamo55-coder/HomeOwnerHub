import { Card, CardContent } from '@homeownerhub/ui'

// Centered card for /login, /signup, /verify. Brand + auth form only —
// no sidebar, no nav, no chrome.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-muted">HOA Hub</h1>
          <p className="text-sm text-muted-fg">Run your HOA without the paperwork.</p>
        </div>
        <Card variant="elevated">
          <CardContent className="p-6 pt-6">{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}
