import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'

// Friendly 404 inside the dashboard shell, copied from apps/hoa — keeps the
// sidebar visible instead of dead-ending on Next's unstyled default page.
// Reached by notFound() in any page here, and by unknown URLs via the
// [...missing] catch-all next to this file.
export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Card variant="elevated">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Compass className="h-6 w-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2>This page doesn&apos;t exist</h2>
            <p className="text-sm text-muted">
              The link you followed may be old, or the case was moved. Head
              back to your cases and pick where you want to go.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button asChild>
              <Link href="/">Back to cases</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
