import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeownerhub/ui'

// Placeholder. Replaced in the next checkpoint by the Daily Digest dashboard.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-muted">HOA Hub</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Foundation scaffolded. Auth and dashboard land next.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            You&apos;re authenticated. The middleware redirected you here because a session
            cookie is present.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-fg">
            <li>Dashboard with Daily Digest — coming up</li>
            <li>Properties, Documents, Violations, Dues, Meetings — coming up</li>
            <li>Stripe billing — coming up</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
